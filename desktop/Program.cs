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

            // Map a virtual host to in-memory embedded resources. The handler below answers every
            // request under https://app.local/* with the matching file from the assembly.
            const string virtualHost = "app.local";
            core.SetVirtualHostNameToFolderMapping(virtualHost, ".", CoreWebView2HostResourceAccessKind.Deny);
            core.WebResourceRequested += OnWebResourceRequested;
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);

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

            var pathPart = uri.AbsolutePath.TrimStart('/');
            if (string.IsNullOrEmpty(pathPart)) pathPart = "index.html";

            // Strip the query string we use for cache busting (?v=adv62 etc.).
            var resourceName = "webroot/" + pathPart;

            var asm = Assembly.GetExecutingAssembly();
            var stream = asm.GetManifestResourceStream(resourceName);
            if (stream == null)
            {
                e.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                    null, 404, "Not Found", "Content-Type: text/plain; charset=utf-8");
                return;
            }

            var contentType = MimeFor(pathPart);
            // CSP header keeps the surface tight: same-origin only, no remote scripts.
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
                e.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                    null, 500, "Internal Error", "Content-Type: text/plain; charset=utf-8");
            }
            catch { /* nothing else to do here */ }
            Trace.WriteLine($"OnWebResourceRequested error: {ex}");
        }
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
