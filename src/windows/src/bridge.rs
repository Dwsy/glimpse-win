/// JavaScript bridge injected before page scripts run.
/// Uses wry's IPC mechanism.
pub const BRIDGE_JS: &str = r#"
window.glimpse = {
    cursorTip: null,
    send: function(data) {
        window.ipc.postMessage(JSON.stringify(data));
    },
    close: function() {
        window.ipc.postMessage(JSON.stringify({__glimpse_close: true}));
    }
};
"#;
