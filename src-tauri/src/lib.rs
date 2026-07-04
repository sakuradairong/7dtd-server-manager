use base64::{engine::general_purpose, Engine};
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

#[derive(Default)]
struct AppState {
    connection: Option<TelnetConnection>,
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
    let config_for_task = config.clone();

    let connection_result = tauri::async_runtime::spawn_blocking(move || {
        TelnetConnection::connect_with_diagnostics(config_for_task, |phase, message| {
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
            }
            emit_server_event(&app, json!({ "type": "connected" }));
            emit_server_event(&app, json!({ "type": "authenticated" }));
            log_line(
                &app,
                format!("Connected to {}:{}", config.host, config.port),
                "event",
            );
            let diagnostics = diagnostics.lock().expect("diagnostics lock").clone();
            Ok(json!({ "success": true, "state": state_snapshot, "diagnostics": diagnostics }))
        }
        Ok(Err(error)) => {
            log_line(&app, format!("Connection failed: {}", error), "error");
            emit_server_event(&app, json!({ "type": "error", "message": error }));
            let diagnostics = diagnostics.lock().expect("diagnostics lock").clone();
            Ok(json!({ "success": false, "error": error, "diagnostics": diagnostics }))
        }
        Err(error) => {
            log_line(&app, format!("Connection failed: {}", error), "error");
            emit_server_event(&app, json!({ "type": "error", "message": error }));
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
        .and_then(|guard| {
            guard
                .connection
                .as_ref()
                .map(|connection| connection.state.clone())
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
    let command_for_task = command.clone();

    let command_result = tauri::async_runtime::spawn_blocking(move || {
        log_line(&app_for_task, format!("> {}", command_for_task), "command");
        let state = app_for_task.state::<SharedState>();
        let (timeout_ms, silence_ms) = command_options(&command_for_task);
        send_raw_with_options(&state, &command_for_task, timeout_ms, silence_ms)
    })
    .await
    .map_err(|error| format!("Command task failed: {}", error));

    match command_result {
        Ok(Ok(result)) => {
            log_command_result(&app, &result);
            Ok(json!(result))
        }
        Ok(Err(error)) => {
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
    }
}

#[tauri::command]
async fn api_call(method: String, args: Vec<Value>, app: AppHandle) -> Result<Value, String> {
    let app_for_task = app.clone();
    let method_for_task = method.clone();
    let args_for_task = args.clone();

    let api_result = tauri::async_runtime::spawn_blocking(move || {
        log_line(
            &app_for_task,
            format!(
                "API call: {}({})",
                method_for_task,
                args_for_task
                    .iter()
                    .map(Value::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            "command",
        );

        let state = app_for_task.state::<SharedState>();
        match method_for_task.as_str() {
            "listPlayers" => match send_raw_with_options(&state, "listplayers", 15_000, 400) {
                Ok(result) => {
                    let players = parse_list_players(&result.response);
                    log_line(
                        &app_for_task,
                        format!("API result: listPlayers = {} players", players.len()),
                        "response",
                    );
                    json!({ "success": true, "data": players })
                }
                Err(error) => {
                    log_line(
                        &app_for_task,
                        format!("API error (listPlayers): {}", error),
                        "error",
                    );
                    json!({ "success": false, "error": error })
                }
            },
            _ => {
                json!({ "success": false, "error": format!("Unknown method: {}", method_for_task) })
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
    let dir = PathBuf::from(&directory);
    if !dir.is_dir() {
        return json!({ "success": false, "error": "Invalid directory" });
    }

    let extensions = ["png", "jpg", "jpeg", "bmp", "gif", "webp"];
    let mut files = Vec::new();

    match fs::read_dir(&dir) {
        Ok(entries) => {
            for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    let ext = ext.to_string_lossy().to_lowercase();
                    if extensions.contains(&ext.as_str()) {
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
    match fs::read(&file_path) {
        Ok(data) => {
            let ext = PathBuf::from(&file_path)
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
    match fs::read_to_string(&file_path) {
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
    match save_config_updates(&file_path, &updates) {
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
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn persist_profiles(app: &AppHandle, storage: &ProfileStorage) -> Result<(), String> {
    let path = profiles_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let content = serde_json::to_string_pretty(storage).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
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

    let property_re = Regex::new(r#"<property\s+([^>]*)/?>"#).map_err(|error| error.to_string())?;
    let value_re = Regex::new(r#"value\s*=\s*"[^"]*""#).map_err(|error| error.to_string())?;
    let updated = property_re.replace_all(&content, |captures: &regex::Captures<'_>| {
        let full = captures
            .get(0)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let attributes = captures
            .get(1)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let Some(property_name) = read_xml_attribute(attributes, "name") else {
            return full.to_string();
        };
        let Some(update) = updates.iter().find(|update| update.name == property_name) else {
            return full.to_string();
        };
        let escaped_value = xml_escape(&update.value);
        if value_re.is_match(full) {
            let replacement = format!("value=\"{}\"", escaped_value);
            value_re
                .replace(full, regex::NoExpand(&replacement))
                .to_string()
        } else {
            full.replacen("/>", &format!(" value=\"{}\"/>", escaped_value), 1)
        }
    });

    fs::write(file_path, updated.as_bytes()).map_err(|error| error.to_string())
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

fn parse_list_players(response: &str) -> Vec<PlayerInfo> {
    response
        .lines()
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
    fn rejects_multiline_telnet_commands() {
        assert!(validate_telnet_command("say hello").is_ok());
        assert!(validate_telnet_command("say hello\nshutdown").is_err());
        assert!(validate_telnet_command("say hello\rshutdown").is_err());
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
