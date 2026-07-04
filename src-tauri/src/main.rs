// Prevent empty console window from appearing on Windows in both debug and release builds.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    sevendtd_server_manager_lib::run();
}
