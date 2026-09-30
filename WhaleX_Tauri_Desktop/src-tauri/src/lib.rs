use std::{fs, path::PathBuf};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn focus_window(app: &AppHandle, label: &str) -> Result<(), String> {
    let window = app.get_webview_window(label).ok_or_else(|| format!("window {label} not found"))?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
fn show_capture(app: AppHandle) -> Result<(), String> { focus_window(&app, "capture") }
#[tauri::command]
fn show_main(app: AppHandle) -> Result<(), String> { focus_window(&app, "main") }
#[tauri::command]
fn hide_capture(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("capture") { window.hide().map_err(|e| e.to_string())?; }
    Ok(())
}
fn sticky_label(id: &str) -> Result<String, String> {
    if id.is_empty() || id.len() > 120 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid note ID".into());
    }
    Ok(format!("sticky-{id}"))
}
#[tauri::command]
async fn open_sticky(app: AppHandle, id: String) -> Result<(), String> {
    let label = sticky_label(&id)?;
    if let Some(window) = app.get_webview_window(&label) {
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
        return focus_window(&app, &label);
    }
    // The same editable composer as Quick Capture, not a read-only pinned card.
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(format!("capture.html?id={id}").into()))
        .title("WhaleX · 提示词便签").inner_size(440.0, 650.0).min_inner_size(370.0, 560.0)
        .resizable(true).decorations(false).always_on_top(true).skip_taskbar(false).shadow(true).center()
        .build().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn minimize_sticky(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&sticky_label(&id)?) { window.minimize().map_err(|e| e.to_string())?; }
    Ok(())
}
#[tauri::command]
fn close_sticky(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&sticky_label(&id)?) { window.close().map_err(|e| e.to_string())?; }
    Ok(())
}
#[tauri::command]
fn broadcast_notes_changed(app: AppHandle) -> Result<(), String> { app.emit("notes-changed", ()).map_err(|e| e.to_string()) }
fn export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app.path().document_dir().map_err(|e| e.to_string())?;
    dir.push("WhaleX Exports"); fs::create_dir_all(&dir).map_err(|e| e.to_string())?; Ok(dir)
}
#[tauri::command]
fn export_text(app: AppHandle, filename: String, content: String) -> Result<String, String> {
    let mut path = export_dir(&app)?;
    let safe: String = filename.chars().map(|c| if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') { '_' } else { c }).collect();
    if safe.is_empty() || safe == "." || safe == ".." || safe.len() > 200 { return Err("Invalid export filename".into()); }
    path.push(safe);
    // Do not silently overwrite a previous backup with the same name.
    if path.exists() {
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("WhaleX");
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("txt");
        let unique = format!("{stem}-{stamp}.{ext}");
        path.set_file_name(unique);
    }
    fs::write(&path, content).map_err(|e| e.to_string())?; Ok(path.to_string_lossy().to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .on_window_event(|window, event| {
            if matches!(window.label(), "main" | "capture") {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close(); let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            #[cfg(desktop)]
            {
                let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
                app.handle().plugin(tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, pressed, event| {
                        if pressed == &shortcut && event.state() == ShortcutState::Pressed { let _ = focus_window(app, "capture"); }
                    }).build())?;
                if let Err(err) = app.global_shortcut().register(Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space)) {
                    eprintln!("WhaleX: shortcut unavailable ({err}); use the tray's Quick Capture entry.");
                }
            }
            let show = MenuItem::with_id(app, "show", "打开 WhaleX", true, None::<&str>)?;
            let capture = MenuItem::with_id(app, "capture", "悬浮输入便签", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 WhaleX", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &capture, &quit])?;
            let mut builder = TrayIconBuilder::new().tooltip("WhaleX · 随手记一个 Prompt").menu(&menu).show_menu_on_left_click(false);
            if let Some(icon) = app.default_window_icon() { builder = builder.icon(icon.clone()); }
            builder.on_menu_event(|app, event| match event.id.as_ref() {
                "show" => { let _ = focus_window(app, "main"); }
                "capture" => { let _ = focus_window(app, "capture"); }
                "quit" => app.exit(0), _ => {}
            }).on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    let _ = focus_window(tray.app_handle(), "main");
                }
            }).build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![show_capture, show_main, hide_capture, open_sticky, minimize_sticky, close_sticky, broadcast_notes_changed, export_text])
        .run(tauri::generate_context!()).expect("error while running WhaleX");
}
