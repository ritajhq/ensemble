#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tally_ledger::Ledger;
use tauri::State;

#[tauri::command]
fn record(amount: f64, ledger: State<'_, Mutex<Ledger>>) -> f64 {
    let mut ledger = ledger.lock().expect("the ledger lock is never poisoned");
    ledger.record(amount);
    ledger.total()
}

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(Ledger::default()))
        .invoke_handler(tauri::generate_handler![record])
        .run(tauri::generate_context!())
        .expect("the window opens");
}
