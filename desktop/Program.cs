using System.Diagnostics;
using System.Reflection;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace NvidiaReportViewer;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.Run(new MainForm());
    }
}

internal sealed class MainForm : Form
{
    private readonly WebView2 _webView;

    public MainForm()
    {
        Text = "NVIDIA Report Viewer";
        StartPosition = FormStartPosition.CenterScreen;
        Width = 1400;
        Height = 920;
        MinimumSize = new Size(1100, 700);
        BackColor = Color.FromArgb(15, 15, 15);

        try
        {
            using var iconStream = typeof(MainForm).Assembly.GetManifestResourceStream("webroot/favicon.svg");
            // Form icons need .ico; fall through to default if not embedded.
            if (File.Exists("app.ico"))
            {
                Icon = new Icon("app.ico");
            }
            iconStream?.Dispose();
        }
        catch
        {
            // Default icon is fine.
        }

        _webView = new WebView2 { Dock = DockStyle.Fill };
        Controls.Add(_webView);
        _ = InitWebViewAsync();
    }

    /// <summary>
    /// Initialise the WebView2 control with a per-user data folder, hide the right-click menu,
    /// disable dev tools in release builds, and wire the embedded webroot to a virtual https origin
    /// so the page behaves as if served from a real server (file:// is too restrictive for
    /// SubtleCrypto / ES module workers / blob URLs the report-viewer relies on).
    /// </summary>
    private async Task InitWebViewAsync()
    {
        try
        {
            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var userDataFolder = Path.Combine(localAppData, "NvidiaReportViewer", "WebView2");
            Directory.CreateDirectory(userDataFolder);

            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder).ConfigureAwait(true);
            await _webView.EnsureCoreWebView2Async(env).ConfigureAwait(true);

            var core = _webView.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled =
#if DEBUG
                true;
#else
                false;
#endif
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = true;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsBuiltInErrorPageEnabled = true;

            // Intercept every request to our virtual origin and serve the matching embedded resource.
            // We deliberately DO NOT use SetVirtualHostNameToFolderMapping: that API requires a real folder
            // on disk and would short-circuit the WebResourceRequested event below.
            const string virtualHost = "app.local";
            core.WebResourceRequested += OnWebResourceRequested;
            core.AddWebResourceRequestedFilter($"https://{virtualHost}/*", CoreWebView2WebResourceContext.All);

            // External links open in the user's default browser, not inside the app shell.
            core.NewWindowRequested += (s, e) =>
            {
                e.Handled = true;
                try { Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true }); }
                catch { /* swallow: user can copy the link manually. */ }
            };

            // Seed downloads to the user's Downloads folder by default.
            core.DownloadStarting += (s, e) =>
            {
                try
                {
                    var downloads = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                    var folder = Path.Combine(downloads, "Downloads");
                    if (Directory.Exists(folder))
                    {
                        var name = Path.GetFileName(e.ResultFilePath);
                        e.ResultFilePath = Path.Combine(folder, name);
                    }
                }
                catch { /* default path is fine. */ }
            };

            core.Navigate($"https://{virtualHost}/index.html");
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Failed to start WebView2.\n\n" + ex.Message + "\n\n" +
                "If this is a fresh Windows 10 install, please install the Microsoft Edge WebView2 Runtime: " +
                "https://developer.microsoft.com/microsoft-edge/webview2/",
                "NVIDIA Report Viewer",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        try
        {
            var uri = new Uri(e.Request.Uri);
            if (!uri.Host.Equals("app.local", StringComparison.OrdinalIgnoreCase)) return;

            // AbsolutePath already excludes query strings (e.g. "?v=adv62"); decode percent escapes.
            var pathPart = Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/');
            if (string.IsNullOrEmpty(pathPart)) pathPart = "index.html";

            var resourceName = "webroot/" + pathPart;
            var stream = LoadEmbeddedResource(resourceName);
            if (stream == null)
            {
                var bodyBytes = System.Text.Encoding.UTF8.GetBytes(
                    $"<!doctype html><meta charset=utf-8><title>Resource missing</title>" +
                    $"<body style='font-family:Segoe UI,sans-serif;background:#111;color:#eee;padding:2rem'>" +
                    $"<h1>Resource not found</h1>" +
                    $"<p>The application could not load <code>{System.Net.WebUtility.HtmlEncode(resourceName)}</code> from the embedded webroot.</p>" +
                    $"<p>Path requested: <code>{System.Net.WebUtility.HtmlEncode(uri.AbsoluteUri)}</code></p>" +
                    $"<hr><p style='font-size:.8em;color:#888'>Please reinstall NVIDIA Report Viewer.</p>");
                e.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                    new MemoryStream(bodyBytes), 404, "Not Found",
                    "Content-Type: text/html; charset=utf-8");
                Trace.WriteLine($"WebResourceRequested 404: {resourceName} (uri={uri})");
                return;
            }

            var contentType = MimeFor(pathPart);
            var headers = string.Join("\r\n",
                $"Content-Type: {contentType}",
                "Cache-Control: no-cache",
                "Access-Control-Allow-Origin: *",
                "Cross-Origin-Resource-Policy: same-site");

            e.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                stream, 200, "OK", headers);
        }
        catch (Exception ex)
        {
            try
            {
                var msg = System.Text.Encoding.UTF8.GetBytes($"Internal error: {ex.Message}");
                e.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                    new MemoryStream(msg), 500, "Internal Error",
                    "Content-Type: text/plain; charset=utf-8");
            }
            catch { /* nothing else to do here */ }
            Trace.WriteLine($"OnWebResourceRequested error: {ex}");
        }
    }

    /// <summary>
    /// Read an embedded resource into a <see cref="MemoryStream"/> so WebView2 can consume it
    /// asynchronously without us having to keep a file handle open. Returns null when no
    /// resource matches (so the caller can serve a 404 page).
    /// </summary>
    private static MemoryStream? LoadEmbeddedResource(string resourceName)
    {
        var asm = Assembly.GetExecutingAssembly();
        using var src = asm.GetManifestResourceStream(resourceName);
        if (src == null) return null;
        var ms = new MemoryStream(capacity: (int)Math.Min(int.MaxValue, src.CanSeek ? src.Length : 64 * 1024));
        src.CopyTo(ms);
        ms.Position = 0;
        return ms;
    }

    private static string MimeFor(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext switch
        {
            ".html" => "text/html; charset=utf-8",
            ".htm"  => "text/html; charset=utf-8",
            ".css"  => "text/css; charset=utf-8",
            ".js"   => "application/javascript; charset=utf-8",
            ".mjs"  => "application/javascript; charset=utf-8",
            ".json" => "application/json; charset=utf-8",
            ".svg"  => "image/svg+xml",
            ".png"  => "image/png",
            ".jpg"  => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            ".ico"  => "image/x-icon",
            ".woff" => "font/woff",
            ".woff2"=> "font/woff2",
            ".ttf"  => "font/ttf",
            ".otf"  => "font/otf",
            ".txt"  => "text/plain; charset=utf-8",
            _       => "application/octet-stream",
        };
    }
}
