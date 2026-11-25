// Verhindert unter Windows ein zusätzliches Konsolenfenster in der fertigen App.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    shotsort_lib::run()
}
