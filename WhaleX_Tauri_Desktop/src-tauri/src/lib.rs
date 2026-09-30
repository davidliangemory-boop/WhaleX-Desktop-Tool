use std::{fs, path::PathBuf};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

fn focus_window(app: &AppHandle, label: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        Ok(())
    } else {
        Err(format!("window {label} not found"))
    }
}

fn show_capture_impl(app: &AppHandle) -> Result<(), String> {
    focus_window(app, "capture")
}

#[tauri::command]
fn show_capture(app: AppHandle) -> Result<(), String> {
    show_capture_impl(&app)
}

#[tauri::command]
fn show_main(app: AppHandle) -> Result<(), String> {
    focus_window(&app, "main")
}

#[tauri::command]
fn hide_capture(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("capture") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn sticky_label(id: &str) -> String {
    let safe: String = id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    format!("sticky-{safe}")
}

#[tauri::command]
async fn open_sticky(app: AppHandle, id: String) -> Result<(), String> {
    let label = sticky_label(&id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
        return Ok(());
    }

    let url = format!("sticky.html?id={id}");
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("WhaleX Sticky")
        .inner_size(360.0, 330.0)
        .min_inner_size(280.0, 220.0)
        .resizable(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn minimize_sticky(app: AppHandle, id: String) -> Result<(), String> {
    let label = sticky_label(&id);
    if let Some(window) = app.get_webview_window(&label) {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_sticky(app: AppHandle, id: String) -> Result<(), String> {
    let label = sticky_label(&id);
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn broadcast_notes_changed(app: AppHandle) -> Result<(), String> {
    app.emit("notes-changed", ()).map_err(|e| e.to_string())
}

fn export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app.path().document_dir().map_err(|e| e.to_string())?;
    dir.push("WhaleX Exports");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn export_text(app: AppHandle, filename: String, content: String) -> Result<String, String> {
    let mut path = export_dir(&app)?;
    let safe_name: String = filename
        .chars()
        .map(|c| if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') { '_' } else { c })
        .collect();
    path.push(safe_name);
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let handler_shortcut = Shortcut::new(
                    Some(Modifiers::CONTROL | Modifiers::SHIFT),
                    Code::Space,
                );
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app_handle, shortcut| {
                            if shortcut == &handler_shortcut {
                                let _ = show_capture_impl(app_handle);
                            }
                        })
                        .build(),
                )?;
                let register_shortcut = Shortcut::new(
                    Some(Modifiers::CONTROL | Modifiers::SHIFT),
                    Code::Space,
                );
                app.global_shortcut().register(register_shortcut)?;
            }

            let show_i = MenuItem::with_id(app, "show", "打开 WhaleX", true, None::<&str>)?;
            let capture_i = MenuItem::with_id(app, "capture", "快速记录", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &capture_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("WhaleX")
                .menu(&menu)
                .menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => { let _ = focus_window(app, "main"); }
                    "capture" => { let _ = show_capture_impl(app); }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let _ = focus_window(tray.app_handle(), "main");
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_capture,
            show_main,
            hide_capture,
            open_sticky,
            minimize_sticky,
            close_sticky,
            broadcast_notes_changed,
            export_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running WhaleX");
}
