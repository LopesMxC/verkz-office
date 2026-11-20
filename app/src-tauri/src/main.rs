// Esconde o console no Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    verkz_office_lib::run()
}
