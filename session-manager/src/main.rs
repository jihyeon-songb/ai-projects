#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod codex;
mod fonts;

use anyhow::Result;
use app::SessionManagerApp;
use codex::AppConfig;

fn main() -> Result<()> {
    let Some(config) = AppConfig::from_args(std::env::args().skip(1))? else {
        return Ok(());
    };
    let native_options = eframe::NativeOptions {
        viewport: eframe::egui::ViewportBuilder::default()
            .with_inner_size([1180.0, 760.0])
            .with_min_inner_size([860.0, 560.0]),
        ..Default::default()
    };

    eframe::run_native(
        "Codex Session Manager",
        native_options,
        Box::new(move |cc| {
            let loaded_korean_font = fonts::configure_fonts(&cc.egui_ctx);
            Ok(Box::new(SessionManagerApp::new(config, loaded_korean_font)))
        }),
    )
    .map_err(|err| anyhow::anyhow!(err.to_string()))
}
