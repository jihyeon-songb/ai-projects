use eframe::egui::{Context, FontData, FontDefinitions, FontFamily};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const KOREAN_FONT_NAME: &str = "system_korean";

pub fn configure_fonts(ctx: &Context) -> Option<PathBuf> {
    let font_path = korean_font_candidates()
        .into_iter()
        .find(|path| path.exists())?;
    let font_bytes = std::fs::read(&font_path).ok()?;

    let mut fonts = FontDefinitions::default();
    fonts.font_data.insert(
        KOREAN_FONT_NAME.to_owned(),
        Arc::new(FontData::from_owned(font_bytes)),
    );

    if let Some(family) = fonts.families.get_mut(&FontFamily::Proportional) {
        family.push(KOREAN_FONT_NAME.to_owned());
    }
    if let Some(family) = fonts.families.get_mut(&FontFamily::Monospace) {
        family.push(KOREAN_FONT_NAME.to_owned());
    }

    ctx.set_fonts(fonts);
    Some(font_path)
}

fn korean_font_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(path) = std::env::var("CODEX_SESSION_MANAGER_KOREAN_FONT") {
        candidates.push(PathBuf::from(path));
    }

    candidates.extend([
        Path::new("/System/Library/Fonts/Supplemental/AppleGothic.ttf").to_path_buf(),
        Path::new("/System/Library/Fonts/Supplemental/Arial Unicode.ttf").to_path_buf(),
        Path::new("/System/Library/Fonts/AppleSDGothicNeo.ttc").to_path_buf(),
        Path::new("/Library/Fonts/AppleGothic.ttf").to_path_buf(),
        Path::new("/Library/Fonts/NotoSansCJKkr-Regular.otf").to_path_buf(),
        Path::new("/Library/Fonts/NotoSansCJK-Regular.ttc").to_path_buf(),
        Path::new("C:\\Windows\\Fonts\\malgun.ttf").to_path_buf(),
        Path::new("C:\\Windows\\Fonts\\malgunbd.ttf").to_path_buf(),
        Path::new("C:\\Windows\\Fonts\\gulim.ttc").to_path_buf(),
        Path::new("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc").to_path_buf(),
        Path::new("/usr/share/fonts/opentype/noto/NotoSansCJKkr-Regular.otf").to_path_buf(),
        Path::new("/usr/share/fonts/truetype/noto/NotoSansKR-Regular.otf").to_path_buf(),
        Path::new("/usr/share/fonts/truetype/nanum/NanumGothic.ttf").to_path_buf(),
    ]);

    if let Ok(windir) = std::env::var("WINDIR") {
        candidates.push(Path::new(&windir).join("Fonts").join("malgun.ttf"));
        candidates.push(Path::new(&windir).join("Fonts").join("malgunbd.ttf"));
    }

    candidates
}
