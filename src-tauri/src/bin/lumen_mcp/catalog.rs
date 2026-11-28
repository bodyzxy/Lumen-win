use serde_json::{json, Value};

fn tool(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required
        }
    })
}

pub fn tools() -> Vec<Value> {
    vec![
        tool(
            "open_photos",
            "Open one or more photos in the live Lumen window (plays the Develop animation and adds them to the filmstrip).",
            json!({
                "paths": { "type": "array", "items": { "type": "string" }, "description": "Absolute file paths to photos (JPEG, PNG, WebP, TIFF, or camera RAW)." }
            }),
            &["paths"],
        ),
        tool(
            "list_sessions",
            "List all photos currently open in Lumen's filmstrip, including their session IDs, dimensions, and edited status.",
            json!({}),
            &[],
        ),
        tool(
            "switch_session",
            "Switch the active photo in Lumen's canvas (plays the filmstrip morph transition).",
            json!({
                "session_id": { "type": "string", "description": "UUID of the session from list_sessions or open_photos." }
            }),
            &["session_id"],
        ),
        tool(
            "close_session",
            "Close a photo session in Lumen.",
            json!({
                "session_id": { "type": "string", "description": "Optional session UUID. Defaults to the currently active photo." }
            }),
            &[],
        ),
        tool(
            "get_edit_state",
            "Get the complete EditState JSON (basic settings + all adjustment layers) for the active photo.",
            json!({}),
            &[],
        ),
        tool(
            "set_basic_adjustments",
            "Partially update BasicSettings in Lumen with live UI animation and auto-switching to the corresponding Inspector tab (Light/Color/Texture/Effects/Calibrate). IMPORTANT: Inspect the photo first via render_preview + get_image_analysis before choosing values; never guess blind preset numbers.",
            json!({
                "params": {
                    "type": "object",
                    "description": "Subset of BasicSettings: exposure (-5..5), contrast (-100..100), highlights (-100..100), shadows (-100..100), whites (-100..100), blacks (-100..100), temperature (-100..100), tint (-100..100), vibrance (-100..100), saturation (-100..100), texture (-100..100), clarity (-100..100), dehaze (-100..100), sharpen (0..100), noiseReduction (0..100), vignette (-100..100), grain (0..100), grainSize (0..100), halation (0..100), bloom (0..100), shadowTint (-100..100), redHue/redSaturation/greenHue/greenSaturation/blueHue/blueSaturation (-100..100)."
                },
                "reset_others": { "type": "boolean", "description": "If true, resets all other basic fields to default before applying params." }
            }),
            &["params"],
        ),
        tool(
            "reset_adjustments",
            "Reset basic adjustments or all adjustments (including layers) on the active photo.",
            json!({
                "scope": { "type": "string", "enum": ["basic", "all"], "description": "Whether to reset only 'basic' or 'all'." }
            }),
            &["scope"],
        ),
        tool(
            "add_layer",
            "Add an adjustment layer to the active photo and select it in the UI. Read resource lumen://schema/edit-state for exact parameter structures.",
            json!({
                "kind": {
                    "type": "string",
                    "enum": [
                        "brightnessContrast", "levels", "curves", "exposure",
                        "vibrance", "hueSaturation", "colorBalance", "blackWhite", "photoFilter", "channelMixer", "lut",
                        "invert", "posterize", "threshold", "gradientMap", "selectiveColor",
                        "shadowsHighlights", "hdrToning",
                        "desaturate", "matchColor", "replaceColor", "equalize",
                        "hsl", "colorGrading"
                    ],
                    "description": "Type of adjustment layer."
                },
                "name": { "type": "string", "description": "Optional custom layer name." },
                "opacity": { "type": "number", "description": "Layer opacity 0...100 (default 100)." },
                "visible": { "type": "boolean", "description": "Layer visibility (default true)." },
                "blend_mode": {
                    "type": "string",
                    "enum": ["normal", "multiply", "screen", "overlay", "softLight", "hardLight", "colorDodge", "colorBurn", "darken", "lighten", "color", "luminosity"],
                    "description": "Layer blend mode (default normal)."
                },
                "params": { "type": "object", "description": "Layer-specific parameter fields." },
                "index": { "type": "integer", "description": "Optional stack index (0 = bottom)." }
            }),
            &["kind"],
        ),
        tool(
            "update_layer",
            "Update an existing adjustment layer's visibility, opacity, blend mode, name, or parameters in the live UI.",
            json!({
                "layer_id": { "type": "string", "description": "UUID of the layer." },
                "name": { "type": "string" },
                "visible": { "type": "boolean" },
                "opacity": { "type": "number" },
                "blend_mode": {
                    "type": "string",
                    "enum": ["normal", "multiply", "screen", "overlay", "softLight", "hardLight", "colorDodge", "colorBurn", "darken", "lighten", "color", "luminosity"]
                },
                "params": { "type": "object", "description": "Partial parameter patch for this layer." }
            }),
            &["layer_id"],
        ),
        tool(
            "set_layer_mask",
            "Attach or update a parametric/manual mask on an adjustment layer: linear gradient, radial gradient, lumaRange, colorRange, or brush.",
            json!({
                "layer_id": { "type": "string", "description": "UUID of the layer." },
                "kind": { "type": "string", "enum": ["none", "linear", "radial", "lumaRange", "colorRange", "brush"], "description": "Mask type." },
                "invert": { "type": "boolean" },
                "feather": { "type": "number", "description": "Edge feather 0...100." },
                "start_x": { "type": "number" }, "start_y": { "type": "number" },
                "end_x": { "type": "number" }, "end_y": { "type": "number" },
                "center_x": { "type": "number" }, "center_y": { "type": "number" },
                "radius_x": { "type": "number" }, "radius_y": { "type": "number" },
                "softness": { "type": "number", "description": "Radial softness 0...100." },
                "luma_min": { "type": "number" }, "luma_max": { "type": "number" }, "luma_falloff": { "type": "number" },
                "target_r": { "type": "number" }, "target_g": { "type": "number" }, "target_b": { "type": "number" },
                "color_tolerance": { "type": "number" }, "color_softness": { "type": "number" }
            }),
            &["layer_id", "kind"],
        ),
        tool(
            "add_spot_patch",
            "Heal or clone a dust spot / blemish at normalized (x, y) by sampling from (source_x, source_y).",
            json!({
                "x": { "type": "number" }, "y": { "type": "number" },
                "radius": { "type": "number", "description": "Normalized radius (default 0.025)." },
                "source_x": { "type": "number" }, "source_y": { "type": "number" }
            }),
            &["x", "y"],
        ),
        tool(
            "layer_action",
            "Delete, duplicate, reorder, or select an existing adjustment layer.",
            json!({
                "layer_id": { "type": "string", "description": "UUID of the layer." },
                "action": { "type": "string", "enum": ["delete", "duplicate", "move_up", "move_down", "select"] }
            }),
            &["layer_id", "action"],
        ),
        tool(
            "apply_preset",
            "Apply a built-in look (plays the Light Sweep animation across the photo) or load a JSON preset file. Analyze the photo first via render_preview + get_image_analysis, and fine-tune exposure/WB/shadows afterwards.",
            json!({
                "preset_key": {
                    "type": "string",
                    "enum": ["warmFilm", "japaneseFresh", "tealOrange", "contrastBW", "fadedVintage", "moodyNight"],
                    "description": "Built-in preset identifier."
                },
                "preset_path": { "type": "string", "description": "Path to a saved Lumen JSON preset file." }
            }),
            &[],
        ),
        tool(
            "sync_adjustments",
            "Copy identical adjustments from the active photo to other open photos. WARNING: For multiple photos with different lighting or scenes, DO NOT blindly sync; instead switch_session and analyze + grade each photo one by one. Only use sync_adjustments when the user explicitly requests identical batch copying (e.g. matching burst shots).",
            json!({
                "target_session_ids": { "type": "array", "items": { "type": "string" }, "description": "Optional list of target session UUIDs. Omit to sync to all open photos." }
            }),
            &[],
        ),
        tool(
            "undo",
            "Undo the last edit on the active photo.",
            json!({}),
            &[],
        ),
        tool(
            "redo",
            "Redo the last undone edit on the active photo.",
            json!({}),
            &[],
        ),
        tool(
            "set_view",
            "Control Lumen's canvas view: toggle split-view comparison, show original wipe, zoom, or inspector visibility.",
            json!({
                "compare_mode": { "type": "string", "enum": ["off", "split"] },
                "split_position": { "type": "number", "description": "Split divider position 0.02...0.98." },
                "show_original": { "type": "boolean", "description": "Hold/show original photo with wipe transition." },
                "zoom": { "type": "string", "description": "'fit', '100%', or numeric zoom factor." },
                "show_inspector": { "type": "boolean" }
            }),
            &[],
        ),
        tool(
            "get_image_analysis",
            "Analyze tonal & color distribution of the active photo: returns 16-bin Luma + Red/Green/Blue histograms, shadows/midtones/highlights zone breakdown (ratio, mean_luma, mean_rgb), near_black_ratio (shadow detail), near_white_ratio, contrast_spread (p05..p95), color_cast_hint, clipping ratios, and YCbCr stats.",
            json!({
                "source": { "type": "string", "enum": ["preview", "original"], "description": "Analyze edited 'preview' (default) or unedited 'original'." }
            }),
            &[],
        ),
        tool(
            "sample_color",
            "Sample a 5x5 average RGB/Hex color at normalized coordinates (0..1, top-left origin) on the active photo.",
            json!({
                "x": { "type": "number", "description": "Normalized X (0...1)." },
                "y": { "type": "number", "description": "Normalized Y (0...1)." },
                "source": { "type": "string", "enum": ["preview", "original"], "description": "Sample edited preview or original image." }
            }),
            &["x", "y"],
        ),
        tool(
            "auto_white_balance",
            "Neutralize white balance by sampling a neutral gray/white point at normalized coordinates (0..1).",
            json!({
                "x": { "type": "number", "description": "Normalized X (0...1)." },
                "y": { "type": "number", "description": "Normalized Y (0...1)." }
            }),
            &["x", "y"],
        ),
        tool(
            "render_preview",
            "Render the current edited photo as a JPEG image so you can visually inspect the result.",
            json!({
                "max_side": { "type": "number", "description": "Maximum long edge in pixels (default 1024)." },
                "output_path": { "type": "string", "description": "Optional file path to also save the preview JPEG." }
            }),
            &[],
        ),
        tool(
            "export_photo",
            "Export the active photo at full resolution (or specified max_side) to JPEG, PNG, WebP, or 16-bit TIFF.",
            json!({
                "output_path": { "type": "string", "description": "Destination file path." },
                "format": { "type": "string", "enum": ["jpeg", "png", "webp", "tiff"], "description": "Export format (default jpeg)." },
                "quality": { "type": "number", "description": "Compression quality 0.5...1.0 for JPEG/WebP (default 0.92)." },
                "max_side": { "type": "number", "description": "Optional max long edge in pixels; omit for original full size." },
                "exif_frame": { "type": "boolean", "description": "Include white gallery border with EXIF metadata watermark." }
            }),
            &["output_path"],
        ),
        tool(
            "set_crop",
            "Crop, rotate (90° turns), flip, or straighten the active photo using normalized coordinates (0..1, top-left origin).",
            json!({
                "x": { "type": "number", "description": "Normalized left edge (0...1)." },
                "y": { "type": "number", "description": "Normalized top edge (0...1)." },
                "width": { "type": "number", "description": "Normalized width (0.05...1)." },
                "height": { "type": "number", "description": "Normalized height (0.05...1)." },
                "straighten": { "type": "number", "description": "Straighten angle in degrees (-45...45)." },
                "quarter_turns": { "type": "integer", "description": "90-degree clockwise turns (0..3)." },
                "flip_h": { "type": "boolean" },
                "flip_v": { "type": "boolean" },
                "perspective_v": { "type": "number", "description": "Vertical keystone correction (-45...45)." },
                "perspective_h": { "type": "number", "description": "Horizontal keystone correction (-45...45)." },
                "reset": { "type": "boolean", "description": "Reset crop & transform to original." }
            }),
            &[],
        ),
        tool(
            "batch_export",
            "Batch export all open photos in the filmstrip to a destination directory.",
            json!({
                "output_dir": { "type": "string", "description": "Destination directory path." },
                "format": { "type": "string", "enum": ["jpeg", "png", "webp", "tiff"], "description": "Export format (default jpeg)." },
                "quality": { "type": "number", "description": "Compression quality 0.5...1.0 (default 0.92)." },
                "max_side": { "type": "number", "description": "Optional max long edge in pixels; omit for original full size." },
                "exif_frame": { "type": "boolean", "description": "Include white gallery border with EXIF metadata watermark." }
            }),
            &["output_dir"],
        ),
        tool(
            "export_lut",
            "Bake and export the color & tone pipeline of the active photo as a .cube 3D LUT file.",
            json!({
                "output_path": { "type": "string", "description": "Destination .cube file path." },
                "size": { "type": "integer", "description": "LUT cube dimension (default 33)." }
            }),
            &["output_path"],
        ),
        tool(
            "set_crop",
            "Crop, rotate (90° turns), flip, or straighten the active photo using normalized coordinates (0..1, top-left origin).",
            json!({
                "x": { "type": "number", "description": "Normalized left edge (0...1)." },
                "y": { "type": "number", "description": "Normalized top edge (0...1)." },
                "width": { "type": "number", "description": "Normalized width (0.05...1)." },
                "height": { "type": "number", "description": "Normalized height (0.05...1)." },
                "straighten": { "type": "number", "description": "Straighten angle in degrees (-45...45)." },
                "quarter_turns": { "type": "integer", "description": "90-degree clockwise turns (0..3)." },
                "flip_h": { "type": "boolean" },
                "flip_v": { "type": "boolean" },
                "reset": { "type": "boolean", "description": "Reset crop & transform to original." }
            }),
            &[],
        ),
        tool(
            "batch_export",
            "Batch export all open photos in the filmstrip to a destination directory.",
            json!({
                "output_dir": { "type": "string", "description": "Destination directory path." },
                "format": { "type": "string", "enum": ["jpeg", "png", "webp", "tiff"], "description": "Export format (default jpeg)." },
                "quality": { "type": "number", "description": "Compression quality 0.5...1.0 (default 0.92)." },
                "max_side": { "type": "number", "description": "Optional max long edge in pixels; omit for original full size." }
            }),
            &["output_dir"],
        ),
    ]
}

pub fn resources() -> Vec<Value> {
    vec![
        json!({
            "uri": "lumen://schema/edit-state",
            "name": "Lumen EditState & Layer Schema",
            "description": "Complete schema and value ranges for BasicSettings and all 24 AdjustmentLayer kinds.",
            "mimeType": "text/markdown"
        }),
        json!({
            "uri": "lumen://presets/builtin",
            "name": "Lumen Built-in Presets",
            "description": "Descriptions of Lumen's 6 built-in looks.",
            "mimeType": "application/json"
        }),
    ]
}

pub fn prompts() -> Vec<Value> {
    vec![json!({
        "name": "auto-color-grade",
        "description": "Standard closed-loop workflow for visually analyzing and color-grading a photo in Lumen.",
        "arguments": [
            { "name": "goal", "description": "Desired look or style (e.g. 'warm film', 'clean portrait', 'moody night').", "required": false }
        ]
    })]
}

pub fn get_prompt(name: &str, args: Option<&Value>) -> Option<Value> {
    if name != "auto-color-grade" {
        return None;
    }
    let goal = args
        .and_then(|a| a.get("goal"))
        .and_then(|v| v.as_str())
        .unwrap_or("balanced, natural color grade");
    Some(json!({
        "description": "Closed-loop color grading workflow in Lumen",
        "messages": [{
            "role": "user",
            "content": {
                "type": "text",
                "text": format!(
                    "Edit the photo in Lumen with goal: {goal}.\n\
                     Follow these steps so the user can watch every adjustment live in Lumen:\n\
                     1. Ensure photos are open (`list_sessions` or `open_photos`). If multiple photos are open, process them ONE BY ONE (`switch_session` -> understand -> grade -> verify -> next photo); never blindly `sync_adjustments` across different scenes.\n\
                     2. Inspect the active photo with BOTH `get_image_analysis` (RGB histograms, shadow/midtone/highlight zones, `near_black_ratio`, `color_cast_hint`) and `render_preview`. Briefly diagnose its lighting, shadows, highlights, and RGB balance before touching sliders.\n\
                     3. Fix exposure, contrast, white balance, and shadow/highlight detail via `set_basic_adjustments`.\n\
                     4. Add stylistic layers (`curves`, `hsl`, `colorGrading`, etc.) via `add_layer`.\n\
                     5. Call `render_preview` and `get_image_analysis` again to verify shadow detail is preserved and there is no unwanted highlight/shadow clipping.\n\
                     6. Optionally call `set_view(compare_mode: \"split\")` so the user can compare before & after."
                )
            }
        }]
    }))
}

pub fn read_resource(uri: &str) -> Option<&'static str> {
    match uri {
        "lumen://schema/edit-state" => Some(
            r#"# Lumen EditState Schema

## 1. BasicSettings (`set_basic_adjustments`)
- **Light (tab 0)**: `exposure` (-5..5 EV), `contrast` (-100..100), `highlights` (-100..100), `shadows` (-100..100), `whites` (-100..100), `blacks` (-100..100)
- **Color (tab 1)**: `temperature` (-100..100), `tint` (-100..100), `vibrance` (-100..100), `saturation` (-100..100)
- **Texture (tab 2)**: `texture` (-100..100), `clarity` (-100..100), `dehaze` (-100..100), `sharpen` (0..100), `noiseReduction` (0..100)
- **Effects (tab 3)**: `vignette` (-100..100), `grain` (0..100), `grainSize` (0..100, default 25)
- **Calibrate (tab 4)**: `shadowTint` (-100..100), `redHue`, `redSaturation`, `greenHue`, `greenSaturation`, `blueHue`, `blueSaturation` (-100..100)

## 2. AdjustmentLayer `params` by `kind`
- `brightnessContrast`: `{ "brightness": -150..150, "contrast": -50..100 }`
- `levels`: `{ "master"|"red"|"green"|"blue": { "inBlack": 0..255, "inWhite": 0..255, "gamma": 0.1..3, "outBlack": 0..255, "outWhite": 0..255 } }`
- `curves`: `{ "rgb"|"red"|"green"|"blue": [{"x": 0..1, "y": 0..1}, ...] }`
- `exposure`: `{ "exposure": -5..5, "offset": -0.5..0.5, "gamma": 0.1..3 }`
- `vibrance`: `{ "vibrance": -100..100, "saturation": -100..100 }`
- `hueSaturation`: `{ "hue": -180..180, "saturation": -100..100, "lightness": -100..100, "colorize": bool, "colorizeHue": 0..360, "colorizeSaturation": 0..100 }`
- `hsl`: `{ "hue": [8 numbers], "saturation": [8 numbers], "luminance": [8 numbers] }` (Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta; each -100..100)
- `colorBalance`: `{ "shadows": [3], "midtones": [3], "highlights": [3], "preserveLuminosity": bool }`
- `colorGrading`: `{ "shadows"|"midtones"|"highlights"|"global": { "hue": 0..360, "saturation": 0..100, "luminance": -100..100 }, "blending": 0..100, "balance": -100..100 }`
- `blackWhite`: `{ "weights": [6 numbers in -200..300], "tint": bool, "tintHue": 0..360, "tintSaturation": 0..100 }`
- `photoFilter`: `{ "color": {"r":0..1,"g":0..1,"b":0..1}, "density": 0..100, "preserveLuminosity": bool }`
- `channelMixer`: `{ "red"|"green"|"blue"|"gray": [R, G, B, Constant in -200..200], "monochrome": bool }`
- `lut`: `{ "path": "C:/path/to/file.cube", "intensity": 0..100 }`
- `selectiveColor`: `{ "groups": [[C,M,Y,K] x 9], "relative": bool }`
- `gradientMap`: `{ "stops": [{"position":0..1,"color":{"r":0..1,"g":0..1,"b":0..1}}], "reverse": bool }`
- `posterize`: `{ "levels": 2..32 }`
- `threshold`: `{ "level": 1..255 }`
- `shadowsHighlights`: `{ "shadowsAmount": 0..100, "shadowsRadius": 1..100, "highlightsAmount": 0..100, "highlightsRadius": 1..100, "colorCorrection": -100..100, "midtoneContrast": -100..100 }`
- `hdrToning`: `{ "radius": 1..100, "strength": 0..100, "gamma": 0.2..2.5, "exposure": -3..3, "detail": -100..200, "vibrance": -100..100, "saturation": -100..100 }`
- `replaceColor`: `{ "target": {"r":0..1,"g":0..1,"b":0..1}, "fuzziness": 0..200, "hue": -180..180, "saturation": -100..100, "lightness": -100..100 }`
- `invert`, `desaturate`, `equalize`: no required params."#,
        ),
        "lumen://presets/builtin" => Some(
            r#"[
  {"key": "warmFilm", "name": "Warm Film", "description": "Faded blacks, warm highlights, light grain"},
  {"key": "japaneseFresh", "name": "Airy Japanese", "description": "High-key, low contrast, cool teal"},
  {"key": "tealOrange", "name": "Teal & Orange", "description": "Teal shadows, orange highlights"},
  {"key": "contrastBW", "name": "Contrasty Mono", "description": "Red-filter look with darkened sky"},
  {"key": "fadedVintage", "name": "Faded Vintage", "description": "Gray blacks, yellowed, coarse grain"},
  {"key": "moodyNight", "name": "City Night", "description": "Cool shadows, warm lights"}
]"#,
        ),
        _ => None,
    }
}
