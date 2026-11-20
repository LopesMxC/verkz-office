mod integrations;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let st = integrations::State::load(app.handle());
            app.manage(st);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            integrations::integrations_status,
            integrations::integrations_set_creds,
            integrations::integrations_disconnect,
            integrations::google_connect,
            integrations::google_agenda,
            integrations::gmail_unread,
            integrations::spotify_connect,
            integrations::spotify_now,
            integrations::spotify_control,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o VERKZ Office");
}
