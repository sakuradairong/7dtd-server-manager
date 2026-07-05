use base64::{engine::general_purpose, Engine};
use quick_xml::events::{BytesStart, Event};
use quick_xml::reader::Reader;
use quick_xml::writer::Writer;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::{ErrorKind, Read, Write};
use std::net::{Shutdown, TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const DEFAULT_PORT: u16 = 8081;
const DEFAULT_TIMEOUT_MS: u64 = 10_000;
const DEFAULT_COMMAND_TIMEOUT_MS: u64 = 10_000;
const DEFAULT_SILENCE_MS: u64 = 200;

const MAP_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "bmp", "gif", "webp"];

fn has_path_traversal(path: &std::path::Path) -> bool {
    path.components()
        .any(|component| component == std::path::Component::ParentDir)
}

fn validate_absolute_path(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() {
        return Err("Path is empty".to_string());
    }
    let path = PathBuf::from(path);
    if !path.is_absolute() {
        return Err("Path must be absolute".to_string());
    }
    if has_path_traversal(&path) {
        return Err("Path contains traversal components".to_string());
    }
    Ok(path)
}

fn validate_xml_file(path: &str) -> Result<PathBuf, String> {
    let path = validate_absolute_path(path)?;
    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("xml") => Ok(path),
        _ => Err("Config file must have .xml extension".to_string()),
    }
}

fn validate_image_file(path: &str) -> Result<PathBuf, String> {
    let path = validate_absolute_path(path)?;
    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext)
            if MAP_IMAGE_EXTENSIONS
                .iter()
                .any(|valid| ext.eq_ignore_ascii_case(valid)) =>
        {
            Ok(path)
        }
        _ => Err(format!(
            "Map image must be one of: {}",
            MAP_IMAGE_EXTENSIONS.join(", ")
        )),
    }
}

fn validate_directory(path: &str) -> Result<PathBuf, String> {
    let path = validate_absolute_path(path)?;
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }
    Ok(path)
}

#[derive(Default)]
struct AppState {
    connection: Option<TelnetConnection>,
    last_error: Option<String>,
}

type SharedState = Mutex<AppState>;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerConfig {
    host: String,
    #[serde(default = "default_port")]
    port: u16,
    password: String,
    #[serde(default = "default_timeout_ms")]
    timeout_ms: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionState {
    connected: bool,
    authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandResult {
    command: String,
    response: String,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct ServerProfile {
    id: String,
    name: String,
    host: String,
    port: u16,
    password: String,
}

#[derive(Clone, Deserialize)]
struct ServerProfileInput {
    id: Option<String>,
    name: String,
    host: String,
    port: u16,
    password: String,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileStorage {
    profiles: Vec<ServerProfile>,
    last_used_profile_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerConfigProperty {
    name: String,
    value: String,
}

#[derive(Clone, Deserialize)]
struct ServerConfigUpdate {
    name: String,
    value: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerInfo {
    entity_id: i64,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    steam_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<Position>,
    #[serde(skip_serializing_if = "Option::is_none")]
    health: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    level: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ping: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EntityInfo {
    entity_id: i64,
    #[serde(rename = "type")]
    entity_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<Position>,
}

#[derive(Clone, Serialize)]
struct Position {
    x: f64,
    y: f64,
    z: f64,
}

struct TelnetConnection {
    stream: TcpStream,
    state: ConnectionState,
}

fn default_port() -> u16 {
    DEFAULT_PORT
}

fn default_timeout_ms() -> u64 {
    DEFAULT_TIMEOUT_MS
}

impl TelnetConnection {
    fn connect_with_diagnostics<F>(config: ServerConfig, mut diagnostic: F) -> Result<Self, String>
    where
        F: FnMut(&str, String),
    {
        let timeout = Duration::from_millis(config.timeout_ms);
        diagnostic(
            "connect",
            format!("Opening TCP connection to {}:{}", config.host, config.port),
        );
        let address = (config.host.as_str(), config.port)
            .to_socket_addrs()
            .map_err(|error| error.to_string())?
            .next()
            .ok_or_else(|| "Unable to resolve server address".to_string())?;

        let mut stream = TcpStream::connect_timeout(&address, timeout)
            .map_err(|error| format!("TCP connection failed: {}", error))?;
        diagnostic("connect", "TCP connection established".to_string());
        stream
            .set_read_timeout(Some(Duration::from_millis(100)))
            .map_err(|error| error.to_string())?;
        stream
            .set_write_timeout(Some(timeout))
            .map_err(|error| error.to_string())?;

        diagnostic(
            "auth",
            "Reading initial server banner or password prompt".to_string(),
        );
        let prompt_grace = Duration::from_millis(1000);
        let prompt = read_until(&mut stream, prompt_grace, |text| {
            let lower = text.to_lowercase();
            lower.contains("password") || lower.contains("enter password")
        })?;
        diagnostic(
            "auth-data",
            format!(
                "Received authentication prompt data: {}",
                diagnostic_snippet(&prompt, &config.password)
            ),
        );

        diagnostic(
            "auth",
            "Sending password (silent servers will receive it immediately)".to_string(),
        );
        stream
            .write_all(format!("{}\r\n", config.password).as_bytes())
            .map_err(|error| error.to_string())?;
        stream.flush().map_err(|error| error.to_string())?;

        let auth_response = read_until(&mut stream, timeout, |text| {
            let lower = text.to_lowercase();
            is_authentication_success(&lower) || is_authentication_failure(&lower)
        })?;
        diagnostic(
            "auth-data",
            format!(
                "Received authentication result data: {}",
                diagnostic_snippet(&auth_response, &config.password)
            ),
        );
        let lower_auth_response = auth_response.to_lowercase();
        if is_authentication_failure(&lower_auth_response) {
            diagnostic("auth-failed", "Server rejected the password".to_string());
            return Err("Invalid password".to_string());
        }
        if !is_authentication_success(&lower_auth_response) {
            diagnostic(
                "auth-timeout",
                "Authentication data did not contain a known success marker".to_string(),
            );
            return Err("Authentication timeout".to_string());
        }
        diagnostic("auth-success", "Server accepted the login".to_string());

        Ok(Self {
            stream,
            state: ConnectionState {
                connected: true,
                authenticated: true,
                last_error: None,
            },
        })
    }

    fn disconnect(&mut self) {
        let _ = self.stream.shutdown(Shutdown::Both);
        self.state = ConnectionState {
            connected: false,
            authenticated: false,
            last_error: None,
        };
    }

    fn send_command(
        &mut self,
        command: &str,
        timeout_ms: u64,
        silence_ms: u64,
    ) -> Result<CommandResult, String> {
        self.stream
            .write_all(format!("{}\r\n", command).as_bytes())
            .map_err(|error| error.to_string())?;
        self.stream.flush().map_err(|error| error.to_string())?;

        let raw_response = read_command_response(
            &mut self.stream,
            command,
            Duration::from_millis(timeout_ms),
            Duration::from_millis(silence_ms),
        )?;
        let response = normalize_command_response(command, &raw_response);

        Ok(CommandResult {
            command: command.to_string(),
            response,
            success: true,
            error: None,
        })
    }
}

fn diagnostic_snippet(text: &str, password: &str) -> String {
    let redacted = redact_password(text, password);
    let normalized = redacted.split_whitespace().collect::<Vec<_>>().join(" ");
    truncate_chars(&normalized, 160)
}

fn redact_password(text: &str, password: &str) -> String {
    if password.is_empty() {
        text.to_string()
    } else {
        text.replace(password, "[password redacted]")
    }
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    let mut chars = text.chars();
    let truncated = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{}...", truncated)
    } else {
        truncated
    }
}

fn is_authentication_success(lower_text: &str) -> bool {
    lower_text.contains("logged in")
        || lower_text.contains("logon successful")
        || lower_text.contains("authenticated")
}

fn is_authentication_failure(lower_text: &str) -> bool {
    lower_text.contains("wrong password")
        || lower_text.contains("password incorrect")
        || lower_text.contains("authentication failed")
}

fn read_until<F>(stream: &mut TcpStream, timeout: Duration, predicate: F) -> Result<String, String>
where
    F: Fn(&str) -> bool,
{
    let deadline = Instant::now() + timeout;
    let mut output = String::with_capacity(8192);
    let mut buffer = [0_u8; 16384];

    loop {
        let now = Instant::now();
        if now >= deadline {
            break;
        }

        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(bytes_read) => {
                output.push_str(&String::from_utf8_lossy(&buffer[..bytes_read]));
                if predicate(&output) {
                    return Ok(output);
                }
            }
            Err(error)
                if error.kind() == ErrorKind::WouldBlock || error.kind() == ErrorKind::TimedOut => {
            }
            Err(error) => return Err(error.to_string()),
        }
    }

    Ok(output)
}

fn read_command_response(
    stream: &mut TcpStream,
    command: &str,
    timeout: Duration,
    silence: Duration,
) -> Result<String, String> {
    let deadline = Instant::now() + timeout;
    let mut output = String::with_capacity(8192);
    let mut buffer = [0_u8; 16384];
    let mut last_data_at: Option<Instant> = None;

    loop {
        let now = Instant::now();
        if now >= deadline {
            break;
        }

        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(bytes_read) => {
                output.push_str(&String::from_utf8_lossy(&buffer[..bytes_read]));
                last_data_at = Some(now);
                if contains_prompt(&output) && output_contains_non_echo(command, &output) {
                    break;
                }
            }
            Err(error)
                if error.kind() == ErrorKind::WouldBlock || error.kind() == ErrorKind::TimedOut =>
            {
                if last_data_at.is_some_and(|instant| now.duration_since(instant) >= silence) {
                    break;
                }
            }
            Err(error) => return Err(error.to_string()),
        }
    }

    if output.is_empty() {
        return Err(format!("Command timeout: {}", command));
    }

    Ok(output)
}

fn normalize_command_response(command: &str, response: &str) -> String {
    response
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !is_command_echo(line, command))
        .filter(|line| !is_prompt_line(line))
        .collect::<Vec<_>>()
        .join("\n")
}

fn is_command_echo(line: &str, command: &str) -> bool {
    let trimmed = line.trim_start_matches('>').trim();
    trimmed == command || trimmed.starts_with(&format!("{} ", command))
}

fn is_prompt_line(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed == ">" || trimmed.ends_with(" >")
}

fn contains_prompt(response: &str) -> bool {
    response.lines().any(is_prompt_line)
}

fn output_contains_non_echo(command: &str, output: &str) -> bool {
    output
        .lines()
        .map(str::trim)
        .any(|line| !line.is_empty() && !is_command_echo(line, command) && !is_prompt_line(line))
}

fn command_options(method: &str) -> (u64, u64) {
    match method {
        "listplayers" | "listents" | "showinventory" => (15_000, 400),
        "saveworld" | "repairchunkdensity" => (30_000, 500),
        "chunkreset" => (20_000, 300),
        "shutdown" => (10_000, 200),
        _ => (DEFAULT_COMMAND_TIMEOUT_MS, DEFAULT_SILENCE_MS),
    }
}

fn validate_telnet_command(command: &str) -> Result<(), String> {
    if command
        .chars()
        .any(|character| character == '\r' || character == '\n')
    {
        return Err("Telnet command must be a single line".to_string());
    }

    Ok(())
}

fn send_raw_with_options(
    state: &State<'_, SharedState>,
    command: &str,
    timeout_ms: u64,
    silence_ms: u64,
) -> Result<CommandResult, String> {
    validate_telnet_command(command)?;

    let mut guard = state
        .lock()
        .map_err(|_| "Application state is unavailable".to_string())?;
    let connection = guard
        .connection
        .as_mut()
        .ok_or_else(|| "Not connected".to_string())?;
    connection.send_command(command, timeout_ms, silence_ms)
}

#[tauri::command]
async fn connect(config: ServerConfig, app: AppHandle) -> Result<Value, String> {
    let app_for_diagnostics = app.clone();
    let diagnostics = Arc::new(Mutex::new(Vec::new()));
    let diagnostics_clone = Arc::clone(&diagnostics);
    let endpoint = format!("{}:{}", config.host, config.port);

    let connection_result = tauri::async_runtime::spawn_blocking(move || {
        TelnetConnection::connect_with_diagnostics(config, |phase, message| {
            diagnostics_clone
                .lock()
                .expect("diagnostics lock")
                .push(json!({ "phase": phase, "message": message }));
            emit_connection_diagnostic(&app_for_diagnostics, phase, &message);
        })
    })
    .await
    .map_err(|error| format!("Connection task failed: {}", error));

    let state = app.state::<SharedState>();
    match connection_result {
        Ok(Ok(connection)) => {
            let state_snapshot = connection.state.clone();
            if let Ok(mut guard) = state.lock() {
                guard.connection = Some(connection);
                guard.last_error = None;
            }
            emit_server_event(&app, json!({ "type": "connected" }));
            emit_server_event(&app, json!({ "type": "authenticated" }));
            log_line(&app, format!("Connected to {}", endpoint), "event");
            let diagnostics = diagnostics.lock().expect("diagnostics lock").clone();
            Ok(json!({ "success": true, "state": state_snapshot, "diagnostics": diagnostics }))
        }
        Ok(Err(error)) => {
            log_line(&app, format!("Connection failed: {}", error), "error");
            emit_server_event(&app, json!({ "type": "error", "message": error }));
            if let Ok(mut guard) = state.lock() {
                guard.last_error = Some(error.clone());
            }
            let diagnostics = diagnostics.lock().expect("diagnostics lock").clone();
            Ok(json!({ "success": false, "error": error, "diagnostics": diagnostics }))
        }
        Err(error) => {
            log_line(&app, format!("Connection failed: {}", error), "error");
            emit_server_event(&app, json!({ "type": "error", "message": error }));
            if let Ok(mut guard) = state.lock() {
                guard.last_error = Some(error.clone());
            }
            let diagnostics = diagnostics.lock().expect("diagnostics lock").clone();
            Ok(json!({ "success": false, "error": error, "diagnostics": diagnostics }))
        }
    }
}

#[tauri::command]
fn disconnect(app: AppHandle, state: State<'_, SharedState>) -> Value {
    if let Ok(mut guard) = state.lock() {
        if let Some(connection) = guard.connection.as_mut() {
            connection.disconnect();
        }
        guard.connection = None;
        guard.last_error = None;
    }
    log_line(&app, "Disconnected from server", "event");
    emit_server_event(&app, json!({ "type": "disconnected" }));
    json!({ "success": true })
}

#[tauri::command]
fn get_state(state: State<'_, SharedState>) -> ConnectionState {
    state
        .lock()
        .ok()
        .map(|guard| {
            guard
                .connection
                .as_ref()
                .map(|connection| connection.state.clone())
                .unwrap_or(ConnectionState {
                    connected: false,
                    authenticated: false,
                    last_error: guard.last_error.clone(),
                })
        })
        .unwrap_or(ConnectionState {
            connected: false,
            authenticated: false,
            last_error: None,
        })
}

#[tauri::command]
async fn send_command(command: String, app: AppHandle) -> Result<Value, String> {
    if let Err(error) = validate_telnet_command(&command) {
        log_line(&app, format!("Command rejected: {}", error), "error");
        return Ok(json!({
            "success": false,
            "error": error,
            "command": command,
            "response": ""
        }));
    }

    let app_for_task = app.clone();

    let command_result = tauri::async_runtime::spawn_blocking(move || {
        log_line(&app_for_task, format!("> {}", command), "command");
        let state = app_for_task.state::<SharedState>();
        let (timeout_ms, silence_ms) = command_options(&command);
        let result = send_raw_with_options(&state, &command, timeout_ms, silence_ms);
        (command, result)
    })
    .await
    .map_err(|error| format!("Command task failed: {}", error));

    match command_result {
        Ok((_, Ok(result))) => {
            log_command_result(&app, &result);
            Ok(json!(result))
        }
        Ok((command, Err(error))) => {
            log_line(
                &app,
                format!("Command error ({}): {}", command, error),
                "error",
            );
            Ok(json!({
                "success": false,
                "error": error,
                "command": command,
                "response": ""
            }))
        }
        Err(error) => {
            log_line(&app, format!("Command task error: {}", error), "error");
            Ok(json!({
                "success": false,
                "error": error,
                "command": "",
                "response": ""
            }))
        }
    }
}

fn api_list_players(state: &State<'_, SharedState>, app: &AppHandle) -> Value {
    match send_raw_with_options(state, "listplayers", 15_000, 400) {
        Ok(result) => {
            let players = parse_list_players(&result.response);
            log_line(
                app,
                format!("API result: listPlayers = {} players", players.len()),
                "response",
            );
            json!({ "success": true, "data": players })
        }
        Err(error) => {
            log_line(app, format!("API error (listPlayers): {}", error), "error");
            json!({ "success": false, "error": error })
        }
    }
}

fn api_list_player_ids(state: &State<'_, SharedState>, app: &AppHandle) -> Value {
    match send_raw_with_options(state, "listplayerids", 10_000, 300) {
        Ok(result) => {
            let players = parse_list_player_ids(&result.response);
            log_line(
                app,
                format!("API result: listPlayerIds = {} players", players.len()),
                "response",
            );
            json!({ "success": true, "data": players })
        }
        Err(error) => {
            log_line(
                app,
                format!("API error (listPlayerIds): {}", error),
                "error",
            );
            json!({ "success": false, "error": error })
        }
    }
}

fn api_list_entities(state: &State<'_, SharedState>, app: &AppHandle) -> Value {
    match send_raw_with_options(state, "listents", 15_000, 400) {
        Ok(result) => {
            let entities = parse_list_entities(&result.response);
            log_line(
                app,
                format!("API result: listEntities = {} entities", entities.len()),
                "response",
            );
            json!({ "success": true, "data": entities })
        }
        Err(error) => {
            log_line(app, format!("API error (listEntities): {}", error), "error");
            json!({ "success": false, "error": error })
        }
    }
}

fn api_get_time(state: &State<'_, SharedState>, app: &AppHandle) -> Value {
    match send_raw_with_options(state, "gettime", 10_000, 300) {
        Ok(result) => match parse_get_time(&result.response) {
            Some(time) => {
                log_line(app, "API result: getTime", "response");
                json!({ "success": true, "data": time })
            }
            None => {
                log_line(app, "API error (getTime): unable to parse", "error");
                json!({ "success": false, "error": "unable to parse gettime output" })
            }
        },
        Err(error) => {
            log_line(app, format!("API error (getTime): {}", error), "error");
            json!({ "success": false, "error": error })
        }
    }
}

fn api_get_version(state: &State<'_, SharedState>, app: &AppHandle) -> Value {
    match send_raw_with_options(state, "version", 10_000, 300) {
        Ok(result) => match parse_version(&result.response) {
            Some(version) => {
                log_line(app, "API result: getVersion", "response");
                json!({ "success": true, "data": version })
            }
            None => {
                log_line(app, "API error (getVersion): unable to parse", "error");
                json!({ "success": false, "error": "unable to parse version output" })
            }
        },
        Err(error) => {
            log_line(app, format!("API error (getVersion): {}", error), "error");
            json!({ "success": false, "error": error })
        }
    }
}

fn api_get_game_preferences(state: &State<'_, SharedState>, app: &AppHandle) -> Value {
    match send_raw_with_options(state, "getgamepref", 10_000, 300) {
        Ok(result) => {
            let prefs = parse_game_preferences(&result.response);
            log_line(
                app,
                format!("API result: getGamePreferences = {} prefs", prefs.len()),
                "response",
            );
            json!({ "success": true, "data": prefs })
        }
        Err(error) => {
            log_line(
                app,
                format!("API error (getGamePreferences): {}", error),
                "error",
            );
            json!({ "success": false, "error": error })
        }
    }
}

#[tauri::command]
async fn api_call(method: String, args: Vec<Value>, app: AppHandle) -> Result<Value, String> {
    let app_for_task = app.clone();

    let api_result = tauri::async_runtime::spawn_blocking(move || {
        log_line(
            &app_for_task,
            format!(
                "API call: {}({})",
                method,
                args.iter()
                    .map(Value::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            "command",
        );

        let state = app_for_task.state::<SharedState>();
        match method.as_str() {
            "listPlayers" => api_list_players(&state, &app_for_task),
            "listPlayerIds" => api_list_player_ids(&state, &app_for_task),
            "listEntities" => api_list_entities(&state, &app_for_task),
            "getTime" => api_get_time(&state, &app_for_task),
            "getVersion" => api_get_version(&state, &app_for_task),
            "getGamePreferences" => api_get_game_preferences(&state, &app_for_task),
            _ => {
                json!({ "success": false, "error": format!("Unknown method: {}", method) })
            }
        }
    })
    .await
    .map_err(|error| format!("API call task failed: {}", error));

    api_result
}

#[tauri::command]
fn get_log_directory(app: AppHandle) -> Result<String, String> {
    Ok(log_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn open_log_directory(app: AppHandle) -> Value {
    match log_dir(&app).and_then(|dir| opener::open(dir).map_err(|error| error.to_string())) {
        Ok(()) => json!({ "success": true }),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

#[tauri::command]
fn save_log(text: String) -> Value {
    match rfd::FileDialog::new().save_file() {
        Some(path) => {
            let path_str = path.to_string_lossy();
            match validate_absolute_path(&path_str) {
                Ok(validated) => match fs::write(&validated, text) {
                    Ok(()) => json!({ "success": true }),
                    Err(error) => json!({ "success": false, "error": error.to_string() }),
                },
                Err(error) => json!({ "success": false, "error": error }),
            }
        }
        None => json!({ "success": false, "error": "No file selected" }),
    }
}

#[tauri::command]
fn select_server_config_file() -> Value {
    match rfd::FileDialog::new()
        .add_filter("XML Files", &["xml"])
        .add_filter("All Files", &["*"])
        .pick_file()
    {
        Some(path) => json!({ "success": true, "filePath": path.to_string_lossy() }),
        None => json!({ "success": false, "error": "No file selected" }),
    }
}

#[tauri::command]
fn select_map_directory() -> Value {
    match rfd::FileDialog::new().pick_folder() {
        Some(path) => json!({ "success": true, "directory": path.to_string_lossy() }),
        None => json!({ "success": false, "error": "No directory selected" }),
    }
}

#[tauri::command]
fn get_map_files(directory: String) -> Value {
    let dir = match validate_directory(&directory) {
        Ok(path) => path,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    let mut files = Vec::new();

    match fs::read_dir(&dir) {
        Ok(entries) => {
            for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    let ext = ext.to_string_lossy().to_lowercase();
                    if MAP_IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                        if let Some(name) = path.file_name() {
                            files.push(json!({
                                "name": name.to_string_lossy(),
                                "path": path.to_string_lossy()
                            }));
                        }
                    }
                }
            }
            files.sort_by(|a, b| {
                let a_name = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let b_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                a_name.cmp(b_name)
            });
            json!({ "success": true, "files": files })
        }
        Err(error) => json!({ "success": false, "error": error.to_string() }),
    }
}

#[tauri::command]
fn read_map_image(file_path: String) -> Value {
    let path = match validate_image_file(&file_path) {
        Ok(path) => path,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    match fs::read(&path) {
        Ok(data) => {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png")
                .to_lowercase();
            let mime = match ext.as_str() {
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "bmp" => "image/bmp",
                "webp" => "image/webp",
                _ => "image/png",
            };
            let base64 = general_purpose::STANDARD.encode(&data);
            json!({
                "success": true,
                "dataUri": format!("data:{};base64,{}", mime, base64)
            })
        }
        Err(error) => json!({ "success": false, "error": error.to_string() }),
    }
}

#[tauri::command]
fn load_server_config(file_path: String, app: AppHandle) -> Value {
    let path = match validate_xml_file(&file_path) {
        Ok(path) => path,
        Err(error) => {
            log_line(
                &app,
                format!("Rejected serverconfig.xml load: {}", error),
                "error",
            );
            return json!({ "success": false, "error": error });
        }
    };

    match fs::read_to_string(&path) {
        Ok(content) => {
            let properties = get_editable_properties(parse_config_properties(&content));
            json!({ "success": true, "config": { "filePath": file_path, "properties": properties } })
        }
        Err(error) => {
            let message = error.to_string();
            log_line(
                &app,
                format!("Failed to load serverconfig.xml: {}", message),
                "error",
            );
            json!({ "success": false, "error": message })
        }
    }
}

#[tauri::command]
fn save_server_config(
    file_path: String,
    updates: Vec<ServerConfigUpdate>,
    app: AppHandle,
) -> Value {
    let path = match validate_xml_file(&file_path) {
        Ok(path) => path,
        Err(error) => {
            log_line(
                &app,
                format!("Rejected serverconfig.xml save: {}", error),
                "error",
            );
            return json!({ "success": false, "error": error });
        }
    };

    match save_config_updates(&path.to_string_lossy(), &updates) {
        Ok(()) => {
            log_line(
                &app,
                format!("Saved serverconfig.xml: {}", file_path),
                "event",
            );
            json!({ "success": true })
        }
        Err(error) => {
            log_line(
                &app,
                format!("Failed to save serverconfig.xml: {}", error),
                "error",
            );
            json!({ "success": false, "error": error })
        }
    }
}

#[tauri::command]
fn get_profiles(app: AppHandle) -> Value {
    match load_profiles(&app) {
        Ok(storage) => json!({ "success": true, "profiles": storage.profiles }),
        Err(error) => json!({ "success": false, "profiles": [], "error": error }),
    }
}

#[tauri::command]
fn save_profile(profile: ServerProfileInput, app: AppHandle) -> Value {
    match load_profiles(&app).and_then(|mut storage| {
        let id = profile.id.unwrap_or_else(generate_id);
        let saved = ServerProfile {
            id: id.clone(),
            name: profile.name,
            host: profile.host,
            port: profile.port,
            password: profile.password,
        };

        if let Some(existing_index) = storage
            .profiles
            .iter()
            .position(|existing| existing.id == id)
        {
            storage.profiles[existing_index] = saved.clone();
        } else {
            storage.profiles.push(saved.clone());
        }

        persist_profiles(&app, &storage).map(|()| saved)
    }) {
        Ok(profile) => json!({ "success": true, "profile": profile }),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

#[tauri::command]
fn delete_profile(id: String, app: AppHandle) -> Value {
    match load_profiles(&app).and_then(|mut storage| {
        let original_len = storage.profiles.len();
        storage.profiles.retain(|profile| profile.id != id);
        if storage.last_used_profile_id.as_deref() == Some(id.as_str()) {
            storage.last_used_profile_id = None;
        }
        let deleted = storage.profiles.len() != original_len;
        persist_profiles(&app, &storage).map(|()| deleted)
    }) {
        Ok(deleted) => json!({ "success": deleted }),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

#[tauri::command]
fn get_last_used_profile(app: AppHandle) -> Value {
    match load_profiles(&app) {
        Ok(storage) => {
            let profile = storage.last_used_profile_id.and_then(|id| {
                storage
                    .profiles
                    .into_iter()
                    .find(|profile| profile.id == id)
            });
            json!({ "success": true, "profile": profile })
        }
        Err(error) => json!({ "success": false, "error": error }),
    }
}

#[tauri::command]
fn set_last_used_profile(id: String, app: AppHandle) -> Value {
    match load_profiles(&app).and_then(|mut storage| {
        if storage.profiles.iter().any(|profile| profile.id == id) {
            storage.last_used_profile_id = Some(id);
            persist_profiles(&app, &storage)?;
        }
        Ok(())
    }) {
        Ok(()) => json!({ "success": true }),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

fn emit_server_event(app: &AppHandle, payload: Value) {
    let _ = app.emit("server-event", payload);
}

fn emit_connection_diagnostic(app: &AppHandle, phase: &str, message: &str) {
    log_line(
        app,
        format!("Connection diagnostic [{}]: {}", phase, message),
        "event",
    );
    emit_server_event(
        app,
        json!({
            "type": "diagnostic",
            "phase": phase,
            "message": message,
        }),
    );
}

fn log_command_result(app: &AppHandle, result: &CommandResult) {
    if !result.success {
        log_line(
            app,
            format!(
                "Command failed ({}): {}",
                result.command,
                result.error.clone().unwrap_or_default()
            ),
            "error",
        );
        return;
    }

    if !result.response.is_empty() {
        let is_truncated = result.response.chars().count() > 1000;
        let truncated = truncate_chars(&result.response, 1000);
        let suffix = if is_truncated { " [truncated]" } else { "" };
        log_line(app, format!("< {}{}", truncated, suffix), "response");
    }
}

fn log_line(app: &AppHandle, message: impl AsRef<str>, level: &str) {
    if let Ok(dir) = log_dir(app) {
        let _ = fs::create_dir_all(&dir);
        let file_path = dir.join(format!("7dtd-manager-{}.log", current_date_string()));
        let timestamp = chrono_like_timestamp();
        let msg = message.as_ref();
        let mut line = String::with_capacity(msg.len() + 32);
        line.push('[');
        line.push_str(&timestamp);
        line.push_str("] [");
        line.push_str(&level.to_ascii_uppercase());
        line.push_str("] ");
        line.push_str(msg);
        line.push('\n');
        let _ = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(file_path)
            .and_then(|mut file| file.write_all(line.as_bytes()));
    }
}

fn log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(base_dir.join("logs"))
}

fn profiles_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(base_dir.join("profiles.json"))
}

fn load_profiles(app: &AppHandle) -> Result<ProfileStorage, String> {
    let path = profiles_path(app)?;
    if !path.exists() {
        return Ok(ProfileStorage::default());
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut storage: ProfileStorage =
        serde_json::from_str(&content).map_err(|error| error.to_string())?;
    for profile in &mut storage.profiles {
        profile.password =
            deobfuscate_password(&profile.password).unwrap_or_else(|| profile.password.clone());
    }
    Ok(storage)
}

fn persist_profiles(app: &AppHandle, storage: &ProfileStorage) -> Result<(), String> {
    let path = profiles_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let encoded: ProfileStorage = ProfileStorage {
        profiles: storage
            .profiles
            .iter()
            .map(|profile| ServerProfile {
                password: obfuscate_password(&profile.password),
                ..profile.clone()
            })
            .collect(),
        last_used_profile_id: storage.last_used_profile_id.clone(),
    };
    let content = serde_json::to_string_pretty(&encoded).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn obfuscate_password(password: &str) -> String {
    format!("obf:{}", general_purpose::STANDARD.encode(password))
}

fn deobfuscate_password(obfuscated: &str) -> Option<String> {
    let encoded = obfuscated.strip_prefix("obf:")?;
    general_purpose::STANDARD
        .decode(encoded)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
}

fn generate_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("{:x}-{:x}", millis, std::process::id())
}

fn parse_config_properties(content: &str) -> Vec<ServerConfigProperty> {
    let property_re = Regex::new(r#"<property\s+([^>]*)/?>"#).expect("valid property regex");
    property_re
        .captures_iter(content)
        .filter_map(|capture| {
            let attributes = capture.get(1)?.as_str();
            let name = read_xml_attribute(attributes, "name")?;
            let value = read_xml_attribute(attributes, "value").unwrap_or_default();
            Some(ServerConfigProperty { name, value })
        })
        .collect()
}

fn read_xml_attribute(attributes: &str, name: &str) -> Option<String> {
    let attr_re = Regex::new(&format!(r#"{}\s*=\s*"([^"]*)""#, regex::escape(name))).ok()?;
    attr_re
        .captures(attributes)
        .and_then(|capture| capture.get(1).map(|value| value.as_str().to_string()))
}

fn save_config_updates(file_path: &str, updates: &[ServerConfigUpdate]) -> Result<(), String> {
    let content = fs::read_to_string(file_path).map_err(|error| error.to_string())?;
    if !content.contains("ServerSettings") {
        return Err("Invalid serverconfig.xml: missing ServerSettings root".to_string());
    }

    let updates_by_name: std::collections::HashMap<String, String> = updates
        .iter()
        .map(|update| (update.name.clone(), xml_escape(&update.value)))
        .collect();

    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::new());
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref element)) if element.name().as_ref() == b"property" => {
                let mut element = element.clone();
                apply_config_update(&mut element, &updates_by_name)?;
                writer
                    .write_event(Event::Start(element))
                    .map_err(|error| error.to_string())?;
            }
            Ok(Event::Empty(ref element)) if element.name().as_ref() == b"property" => {
                let mut element = element.clone();
                apply_config_update(&mut element, &updates_by_name)?;
                writer
                    .write_event(Event::Empty(element))
                    .map_err(|error| error.to_string())?;
            }
            Ok(Event::Eof) => break,
            Ok(event) => {
                writer
                    .write_event(event)
                    .map_err(|error| error.to_string())?;
            }
            Err(error) => return Err(format!("Invalid serverconfig.xml: {}", error)),
        }
        buf.clear();
    }

    let output = String::from_utf8(writer.into_inner()).map_err(|error| error.to_string())?;
    write_file_atomic(file_path, output.as_bytes())
}

fn apply_config_update(
    element: &mut BytesStart,
    updates_by_name: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let name = element
        .attributes()
        .filter_map(|attribute| attribute.ok())
        .find(|attribute| attribute.key.as_ref() == b"name")
        .and_then(|attribute| String::from_utf8(attribute.value.to_vec()).ok());
    let Some(name) = name else {
        return Ok(());
    };
    let Some(value) = updates_by_name.get(&name) else {
        return Ok(());
    };

    let mut attributes: Vec<(Vec<u8>, Vec<u8>)> = Vec::new();
    let mut has_value = false;
    for attribute in element.attributes().filter_map(|attribute| attribute.ok()) {
        let key = attribute.key.as_ref().to_vec();
        let val = if key == b"value" {
            has_value = true;
            value.as_bytes().to_vec()
        } else {
            attribute.value.to_vec()
        };
        attributes.push((key, val));
    }

    element.clear_attributes();
    for (key, val) in attributes {
        element.push_attribute((key.as_slice(), val.as_slice()));
    }
    if !has_value {
        element.push_attribute(("value".as_bytes(), value.as_bytes()));
    }
    Ok(())
}

fn write_file_atomic(file_path: &str, data: &[u8]) -> Result<(), String> {
    let temp_path = format!("{}.tmp", file_path);
    let backup_path = format!("{}.bak", file_path);

    fs::write(&temp_path, data).map_err(|error| format!("Failed to write temp file: {}", error))?;
    let _ = fs::copy(file_path, &backup_path);
    fs::rename(&temp_path, file_path)
        .map_err(|error| format!("Failed to replace config file: {}", error))?;
    let _ = fs::remove_file(&backup_path);
    Ok(())
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn get_editable_properties(properties: Vec<ServerConfigProperty>) -> Vec<ServerConfigProperty> {
    properties
        .into_iter()
        .filter(|property| editable_property_names().contains(&property.name.as_str()))
        .collect()
}

fn editable_property_names() -> Vec<&'static str> {
    vec![
        "ServerName",
        "ServerDescription",
        "ServerWebsiteURL",
        "ServerPassword",
        "ServerLoginConfirmationText",
        "Region",
        "Language",
        "ServerPort",
        "ServerVisibility",
        "MaxPlayers",
        "MaxPlayerCount",
        "GameWorld",
        "WorldGenSeed",
        "WorldGenSize",
        "GameName",
        "GameDifficulty",
        "BlockDamagePlayer",
        "BlockDamageAI",
        "BlockDamageAIBM",
        "XPMultiplier",
        "PlayerSafeZoneLevel",
        "PlayerSafeZoneHours",
        "BuildCreate",
        "DayNightLength",
        "DayLightLength",
        "DeathPenalty",
        "DropOnDeath",
        "DropOnQuit",
        "BloodMoonEnemyCount",
        "EnemyDifficulty",
        "EnemySpawnMode",
        "ZombiesRun",
        "ZombieFeralSense",
        "ZombieBMMove",
        "ZombieFeralMove",
        "ZombieNormalMove",
        "ZombieNightMove",
        "EACEnabled",
        "LandClaimCount",
        "LandClaimSize",
        "LandClaimDeadZone",
        "LandClaimDecayMode",
        "LandClaimExpiryTime",
        "LandClaimOfflineDurabilityModifier",
        "LandClaimOnlineDurabilityModifier",
        "AirDropFrequency",
        "AirDropMarker",
        "PartySharedKillRange",
        "PlayerKillingMode",
        "PersistenceDirectory",
        "ChatWindowEnabled",
        "ShowFriendPlayerOnMap",
        "CameraRestrictionMode",
        "JarRefund",
        "AISmellMode",
    ]
}

fn normalize_response_lines(response: &str) -> Vec<String> {
    response
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect()
}

fn parse_list_players(response: &str) -> Vec<PlayerInfo> {
    normalize_response_lines(response)
        .iter()
        .filter_map(|line| {
            let parts = line.split(',').map(str::trim).collect::<Vec<_>>();
            if parts.len() < 14
                || parts[0]
                    .chars()
                    .next()
                    .is_some_and(|char| !char.is_ascii_digit())
            {
                return None;
            }

            let entity_id = parts[0].parse::<i64>().ok()?;
            let health = parts[5].parse::<i64>().ok();
            let level = parts[10].parse::<i64>().ok();
            let ping = parts[13].parse::<i64>().ok();
            let steam_id = if parts[11].is_empty() {
                None
            } else {
                Some(parts[11].to_string())
            };

            Some(PlayerInfo {
                entity_id,
                name: parts[1].to_string(),
                steam_id,
                position: parse_position(parts[2]),
                health,
                level,
                ping,
            })
        })
        .collect()
}

fn parse_position(text: &str) -> Option<Position> {
    let values = text
        .split_whitespace()
        .filter_map(|token| token.parse::<f64>().ok())
        .collect::<Vec<_>>();

    if values.len() == 3 {
        Some(Position {
            x: values[0],
            y: values[1],
            z: values[2],
        })
    } else {
        None
    }
}

fn parse_list_player_ids(response: &str) -> Vec<Value> {
    normalize_response_lines(response)
        .iter()
        .filter_map(|line| {
            let mut parts = line.splitn(2, '.');
            let entity_id = parts.next()?.trim().parse::<i64>().ok()?;
            let name = parts.next()?.trim();
            Some(json!({ "entityId": entity_id, "name": name }))
        })
        .collect()
}

fn parse_list_entities(response: &str) -> Vec<EntityInfo> {
    normalize_response_lines(response)
        .iter()
        .filter_map(|line| {
            let parts: Vec<_> = line.split(',').map(str::trim).collect();
            if parts.len() < 2 {
                return None;
            }
            let entity_id = parts[0].parse::<i64>().ok()?;
            let entity_type = parts[1].to_string();
            let mut name: Option<String> = None;
            let mut position: Option<Position> = None;
            for part in parts.iter().skip(2) {
                if part.is_empty() {
                    continue;
                }
                if position.is_none() {
                    if let Some(parsed) = parse_position(part) {
                        position = Some(parsed);
                        continue;
                    }
                }
                if name.is_none()
                    && *part != entity_type
                    && part
                        .chars()
                        .next()
                        .is_some_and(|char| char.is_alphabetic() || char == '_')
                {
                    name = Some(part.to_string());
                }
            }
            Some(EntityInfo {
                entity_id,
                entity_type,
                name,
                position,
            })
        })
        .collect()
}

fn parse_get_time(response: &str) -> Option<Value> {
    let text = normalize_response_lines(response).join(" ");
    let re = Regex::new(r"(?i)Day\s+(\d+),\s*(\d{1,2}:\d{2})").ok()?;
    let captures = re.captures(&text)?;
    let day = captures.get(1)?.as_str().parse::<i64>().ok()?;
    let time = captures.get(2)?.as_str().to_string();
    Some(json!({ "day": day, "time": time }))
}

fn parse_version(response: &str) -> Option<Value> {
    let lines: Vec<String> = normalize_response_lines(response);
    if lines.is_empty() {
        return None;
    }
    let prefix = "Game version:";
    let game_version = if lines[0].to_lowercase().starts_with(&prefix.to_lowercase()) {
        lines[0][prefix.len()..].trim().to_string()
    } else {
        lines[0].clone()
    };
    let mods: Vec<String> = lines
        .iter()
        .skip(1)
        .map(|line| {
            if line.to_lowercase().starts_with("mod ") {
                line[4..].trim().to_string()
            } else {
                line.clone()
            }
        })
        .collect();
    Some(json!({ "gameVersion": game_version, "mods": mods }))
}

fn parse_game_preferences(response: &str) -> Vec<Value> {
    normalize_response_lines(response)
        .iter()
        .filter_map(|line| {
            let index = line.find('=')?;
            let name = line[..index].trim();
            let value = line[index + 1..].trim();
            if name.is_empty() || value.is_empty() {
                return None;
            }
            Some(json!({ "name": name, "value": value }))
        })
        .collect()
}

fn current_date_string() -> String {
    let days_since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() / 86_400)
        .unwrap_or_default();
    format!("day-{}", days_since_epoch)
}

fn chrono_like_timestamp() -> String {
    let seconds_since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("unix-{}", seconds_since_epoch)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            connect,
            disconnect,
            get_state,
            send_command,
            api_call,
            get_log_directory,
            open_log_directory,
            save_log,
            select_server_config_file,
            select_map_directory,
            get_map_files,
            read_map_image,
            load_server_config,
            save_server_config,
            get_profiles,
            save_profile,
            delete_profile,
            get_last_used_profile,
            set_last_used_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn parses_list_players_output() {
        let response = "id, name, pos, rot, remote, health, deaths, zombies, players, score, level, steamid, ip, ping\n7, Alice, 1 2 3, 0 0 0, true, 95, 0, 12, 1, 300, 42, steam123, 127.0.0.1, 33";

        let players = parse_list_players(response);

        assert_eq!(players.len(), 1);
        assert_eq!(players[0].entity_id, 7);
        assert_eq!(players[0].name, "Alice");
        assert_eq!(players[0].health, Some(95));
        assert_eq!(players[0].level, Some(42));
        assert_eq!(players[0].steam_id.as_deref(), Some("steam123"));
        assert_eq!(players[0].ping, Some(33));
        let position = players[0].position.as_ref().expect("position parsed");
        assert_eq!((position.x, position.y, position.z), (1.0, 2.0, 3.0));
    }

    #[test]
    fn parses_list_player_ids_output() {
        let response = "1. Alice\n2. Bob\nnot a player";
        let players = parse_list_player_ids(response);
        assert_eq!(players.len(), 2);
        assert_eq!(players[0]["entityId"], 1);
        assert_eq!(players[0]["name"], "Alice");
        assert_eq!(players[1]["entityId"], 2);
        assert_eq!(players[1]["name"], "Bob");
    }

    #[test]
    fn parses_list_entities_output() {
        let response = "1, zombie, 10 20 30\n2, animalBoar, Pumba, 5 5 5\nnot valid";
        let entities = parse_list_entities(response);
        assert_eq!(entities.len(), 2);
        assert_eq!(entities[0].entity_id, 1);
        assert_eq!(entities[0].entity_type, "zombie");
        assert!(entities[0].name.is_none());
        let pos = entities[0].position.as_ref().expect("position");
        assert_eq!((pos.x, pos.y, pos.z), (10.0, 20.0, 30.0));
        assert_eq!(entities[1].entity_id, 2);
        assert_eq!(entities[1].entity_type, "animalBoar");
        assert_eq!(entities[1].name.as_deref(), Some("Pumba"));
    }

    #[test]
    fn parses_get_time_output() {
        let response = "Day 12, 14:30";
        let time = parse_get_time(response).expect("parsed time");
        assert_eq!(time["day"], 12);
        assert_eq!(time["time"], "14:30");
    }

    #[test]
    fn parses_version_output() {
        let response = "Game version: Alpha 21 (b324)\nMod SomeMod\nAnother line";
        let version = parse_version(response).expect("parsed version");
        assert_eq!(version["gameVersion"], "Alpha 21 (b324)");
        let mods = version["mods"].as_array().expect("mods array");
        assert_eq!(mods.len(), 2);
        assert_eq!(mods[0], "SomeMod");
        assert_eq!(mods[1], "Another line");
    }

    #[test]
    fn parses_game_preferences_output() {
        let response = "ServerName=My Server\nMaxPlayers=8\nno equals";
        let prefs = parse_game_preferences(response);
        assert_eq!(prefs.len(), 2);
        assert_eq!(prefs[0]["name"], "ServerName");
        assert_eq!(prefs[0]["value"], "My Server");
        assert_eq!(prefs[1]["name"], "MaxPlayers");
        assert_eq!(prefs[1]["value"], "8");
    }

    #[test]
    fn diagnostic_snippet_truncates_unicode_safely_and_redacts_password() {
        let text = format!("secret secret {}", "连接".repeat(100));
        let snippet = diagnostic_snippet(&text, "secret");

        assert!(snippet.ends_with("..."));
        assert!(!snippet.contains("secret"));
        assert!(snippet.contains("[password redacted]"));
    }

    #[test]
    fn saves_config_updates_to_existing_properties() {
        let path =
            std::env::temp_dir().join(format!("7dtd-tauri-config-test-{}.xml", std::process::id()));
        fs::write(
            &path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<ServerSettings>
  <property name="ServerName" value="Old"/>
  <property name="MaxPlayers" value="8"/>
</ServerSettings>
"#,
        )
        .expect("write test config");

        save_config_updates(
            path.to_str().expect("utf8 temp path"),
            &[
                ServerConfigUpdate {
                    name: "ServerName".to_string(),
                    value: "New & Better".to_string(),
                },
                ServerConfigUpdate {
                    name: "MaxPlayers".to_string(),
                    value: "16".to_string(),
                },
            ],
        )
        .expect("save config updates");

        let saved = fs::read_to_string(&path).expect("read saved config");
        let _ = fs::remove_file(&path);
        assert!(saved.contains(r#"name="ServerName" value="New &amp; Better""#));
        assert!(saved.contains(r#"name="MaxPlayers" value="16""#));
    }

    #[test]
    fn saves_config_updates_with_literal_dollar_signs() {
        let path = std::env::temp_dir().join(format!(
            "7dtd-tauri-config-dollar-test-{}.xml",
            std::process::id()
        ));
        fs::write(
            &path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<ServerSettings>
  <property name="ServerName" value="Old"/>
</ServerSettings>
"#,
        )
        .expect("write test config");

        save_config_updates(
            path.to_str().expect("utf8 temp path"),
            &[ServerConfigUpdate {
                name: "ServerName".to_string(),
                value: r#"server$$name$1${missing}"#.to_string(),
            }],
        )
        .expect("save config updates");

        let saved = fs::read_to_string(&path).expect("read saved config");
        let _ = fs::remove_file(&path);
        assert!(saved.contains(r#"name="ServerName" value="server$$name$1${missing}""#));
    }

    #[test]
    fn saves_config_updates_escapes_xml_special_characters() {
        let path = std::env::temp_dir().join(format!(
            "7dtd-tauri-config-xml-escape-test-{}.xml",
            std::process::id()
        ));
        fs::write(
            &path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<ServerSettings>
  <property name="ServerName" value="Old"/>
</ServerSettings>
"#,
        )
        .expect("write test config");

        save_config_updates(
            path.to_str().expect("utf8 temp path"),
            &[ServerConfigUpdate {
                name: "ServerName".to_string(),
                value: r#"A "quoted" <tag> value & more"#.to_string(),
            }],
        )
        .expect("save config updates");

        let saved = fs::read_to_string(&path).expect("read saved config");
        let _ = fs::remove_file(&path);
        assert!(saved.contains(
            r#"name="ServerName" value="A &quot;quoted&quot; &lt;tag&gt; value &amp; more""#
        ));
    }

    #[test]
    fn saves_config_updates_preserves_comments_and_adds_missing_value_attribute() {
        let path = std::env::temp_dir().join(format!(
            "7dtd-tauri-config-comment-test-{}.xml",
            std::process::id()
        ));
        fs::write(
            &path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!-- Server configuration -->
<ServerSettings>
  <property name="ServerName" value="Old"/>
  <property name="NoValueYet"/>
</ServerSettings>
"#,
        )
        .expect("write test config");

        save_config_updates(
            path.to_str().expect("utf8 temp path"),
            &[
                ServerConfigUpdate {
                    name: "ServerName".to_string(),
                    value: "New Name".to_string(),
                },
                ServerConfigUpdate {
                    name: "NoValueYet".to_string(),
                    value: "Added".to_string(),
                },
            ],
        )
        .expect("save config updates");

        let saved = fs::read_to_string(&path).expect("read saved config");
        let _ = fs::remove_file(&path);
        assert!(saved.contains(r#"name="ServerName" value="New Name""#));
        assert!(saved.contains(r#"name="NoValueYet" value="Added""#));
        assert!(saved.contains("<!-- Server configuration -->"));
        assert!(saved.contains("<ServerSettings>"));
    }

    #[test]
    fn rejects_invalid_serverconfig_xml() {
        let path = std::env::temp_dir().join(format!(
            "7dtd-tauri-config-invalid-test-{}.xml",
            std::process::id()
        ));
        fs::write(
            &path,
            "<ServerSettings><property name=\"X\" value=\"Y\"/></NotServerSettings>",
        )
        .expect("write test config");

        let result = save_config_updates(
            path.to_str().expect("utf8 temp path"),
            &[ServerConfigUpdate {
                name: "X".to_string(),
                value: "Z".to_string(),
            }],
        );

        let _ = fs::remove_file(&path);
        assert!(result.is_err());
    }

    #[test]
    fn rejects_multiline_telnet_commands() {
        assert!(validate_telnet_command("say hello").is_ok());
        assert!(validate_telnet_command("say hello\nshutdown").is_err());
        assert!(validate_telnet_command("say hello\rshutdown").is_err());
    }

    #[test]
    fn path_validation_rejects_empty_relative_and_traversal_paths() {
        assert!(validate_absolute_path("").is_err());
        assert!(validate_absolute_path("serverconfig.xml").is_err());
        assert!(validate_absolute_path("/etc/../etc/passwd").is_err());
        assert!(validate_absolute_path("/tmp/subdir/../../etc/passwd").is_err());

        let temp = std::env::temp_dir();
        assert!(validate_absolute_path(temp.to_str().unwrap()).is_ok());
    }

    #[test]
    fn path_validation_enforces_xml_extension() {
        assert!(validate_xml_file("/tmp/serverconfig.xml").is_ok());
        assert!(validate_xml_file("/tmp/serverconfig.XML").is_ok());
        assert!(validate_xml_file("/tmp/serverconfig.json").is_err());
        assert!(validate_xml_file("/tmp/serverconfig").is_err());
        assert!(validate_xml_file("serverconfig.xml").is_err());
        assert!(validate_xml_file("/etc/../etc/serverconfig.xml").is_err());
    }

    #[test]
    fn path_validation_enforces_image_extension() {
        for ext in ["png", "jpg", "jpeg", "bmp", "gif", "webp"] {
            assert!(
                validate_image_file(&format!("/tmp/map.{}", ext)).is_ok(),
                "expected {} to be accepted",
                ext
            );
        }
        assert!(validate_image_file("/tmp/map.txt").is_err());
        assert!(validate_image_file("/tmp/map").is_err());
        assert!(validate_image_file("map.png").is_err());
        assert!(validate_image_file("/etc/../etc/map.png").is_err());
    }

    #[test]
    fn path_validation_enforces_directory() {
        let temp = std::env::temp_dir();
        assert!(validate_directory(temp.to_str().unwrap()).is_ok());

        let file = temp.join(format!("7dtd-validation-file-{}", std::process::id()));
        fs::write(&file, b"test").expect("write temp file");
        let result = validate_directory(file.to_str().unwrap());
        let _ = fs::remove_file(&file);
        assert!(result.is_err());

        assert!(validate_directory("/tmp/does/not/exist").is_err());
    }

    #[test]
    fn connects_authenticates_and_sends_telnet_command() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock telnet server");
        let port = listener.local_addr().expect("local addr").port();
        let test_password = ["sec", "ret"].join("");
        let expected_password = test_password.clone();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept client");
            stream
                .write_all(b"Password:\n")
                .expect("write password prompt");

            let mut reader = BufReader::new(stream.try_clone().expect("clone stream"));
            let mut password = String::new();
            reader.read_line(&mut password).expect("read password");
            assert_eq!(password.trim(), expected_password);
            stream
                .write_all(b"Logon successful.\n")
                .expect("write auth response");

            let mut command = String::new();
            reader.read_line(&mut command).expect("read command");
            assert_eq!(command.trim(), "listplayers");
            stream
                .write_all(b"listplayers\n7, Alice, 1 2 3, 0 0 0, true, 95, 0, 12, 1, 300, steam123, 127.0.0.1, 33\n>\n")
                .expect("write command response");
        });

        let config = ServerConfig {
            host: "127.0.0.1".to_string(),
            port,
            password: test_password,
            timeout_ms: 1_000,
        };
        let mut connection = TelnetConnection::connect_with_diagnostics(config, |_, _| {})
            .expect("connect and authenticate");
        let result = connection
            .send_command("listplayers", 1_000, 50)
            .expect("send command");
        server.join().expect("mock server thread");

        assert!(result.success);
        assert_eq!(result.command, "listplayers");
        assert!(result.response.contains("Alice"));
    }
}
