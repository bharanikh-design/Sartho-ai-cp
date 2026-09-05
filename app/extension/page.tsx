export default function ExtensionPage() {
  return (
    <div style={{ padding: "2rem", maxWidth: "800px" }}>
      <h1>Sartho Browser Extension</h1>
      <p style={{ color: "#aaa", marginTop: "1rem" }}>
        Install the Sartho Career Agent extension to instantly analyse job fit across LinkedIn and Indeed.
      </p>
      
      <div style={{ marginTop: "2rem", background: "rgba(255,255,255,0.05)", padding: "1.5rem", borderRadius: "8px" }}>
        <h2 style={{ fontSize: "1.25rem", color: "#6bcf93" }}>Chrome & Edge</h2>
        <ol style={{ marginTop: "1rem", color: "#ccc", paddingLeft: "1.5rem", lineHeight: "1.6" }}>
          <li>Download the extension source code from our repository.</li>
          <li>Open <code>chrome://extensions/</code> (Chrome) or <code>edge://extensions/</code> (Edge).</li>
          <li>Enable <strong>Developer mode</strong> in the top right.</li>
          <li>Click <strong>Load unpacked</strong> and select the <code>extension</code> folder.</li>
        </ol>
      </div>

      <div style={{ marginTop: "1.5rem", background: "rgba(255,255,255,0.05)", padding: "1.5rem", borderRadius: "8px" }}>
        <h2 style={{ fontSize: "1.25rem", color: "#6bcf93" }}>Safari</h2>
        <ol style={{ marginTop: "1rem", color: "#ccc", paddingLeft: "1.5rem", lineHeight: "1.6" }}>
          <li>Open Safari Settings &gt; Advanced and check <strong>Show features for web developers</strong>.</li>
          <li>In the Develop menu, select <strong>Allow Unsigned Extensions</strong>.</li>
          <li>Use Xcode to build the Safari Web Extension from the provided source directory.</li>
          <li>Enable the extension in Safari Settings &gt; Extensions.</li>
        </ol>
      </div>
    </div>
  );
}
