//! Serves the app's commands over HTTP for driving the UI from a browser
//! during development. See `rabbit_studio_lib::devbridge`.

fn main() {
    rabbit_studio_lib::devbridge::run();
}
