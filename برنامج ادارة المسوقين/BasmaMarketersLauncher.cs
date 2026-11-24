using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public class BasmaMarketersLauncher
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);

    private static void ShowError(string message)
    {
        MessageBox(IntPtr.Zero, message, "إدارة المسوقين - بصمة سوفت", 0x10);
    }

    private static bool IsOurServer(int port)
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/health");
            request.Method = "GET";
            request.Timeout = 1000;
            request.ReadWriteTimeout = 1000;
            request.Proxy = null;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                string body = reader.ReadToEnd();
                return response.StatusCode == HttpStatusCode.OK && body.IndexOf("\"service\":\"basma-marketers\"", StringComparison.OrdinalIgnoreCase) >= 0;
            }
        }
        catch { return false; }
    }

    private static bool IsPortFree(int port)
    {
        TcpListener listener = null;
        try
        {
            listener = new TcpListener(System.Net.IPAddress.Loopback, port);
            listener.Start();
            return true;
        }
        catch { return false; }
        finally { if (listener != null) listener.Stop(); }
    }

    private static string FindExecutable(string fileName)
    {
        string pathValue = Environment.GetEnvironmentVariable("PATH") ?? "";
        string[] paths = pathValue.Split(';');
        foreach (string entry in paths)
        {
            try
            {
                string folder = entry.Trim().Trim('"');
                if (folder.Length == 0) continue;
                string candidate = Path.Combine(folder, fileName);
                if (File.Exists(candidate)) return candidate;
            }
            catch { }
        }
        return null;
    }

    private static string FindNode()
    {
        string found = FindExecutable("node.exe");
        if (found != null) return found;
        string[] candidates = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe")
        };
        foreach (string candidate in candidates) if (File.Exists(candidate)) return candidate;
        return null;
    }

    private static string FindBrowser()
    {
        string[] candidates = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe")
        };
        foreach (string candidate in candidates) if (File.Exists(candidate)) return candidate;
        string edge = FindExecutable("msedge.exe");
        if (edge != null) return edge;
        return FindExecutable("chrome.exe");
    }

    public static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string startFile = Path.Combine(root, "start.js");
        string database = Path.Combine(root, "data", "basma-marketers.sqlite");
        if (!File.Exists(startFile) || !File.Exists(database))
        {
            ShowError("لم يتم العثور على ملفات البرنامج أو قاعدة البيانات في مجلد التشغيل.\nالمسار المطلوب:\n" + root);
            return;
        }

        int port = 4173;
        if (!IsOurServer(port))
        {
            while (!IsPortFree(port) && port < 4200) port++;
            if (port >= 4200)
            {
                ShowError("لا يوجد منفذ متاح لتشغيل البرنامج.");
                return;
            }

            string node = FindNode();
            if (node == null)
            {
                ShowError("يلزم تثبيت Node.js إصدار 22.13 أو أحدث لتشغيل البرنامج.");
                return;
            }

            ProcessStartInfo server = new ProcessStartInfo();
            server.FileName = node;
            server.Arguments = "\"" + startFile + "\"";
            server.WorkingDirectory = root;
            server.UseShellExecute = false;
            server.CreateNoWindow = true;
            server.WindowStyle = ProcessWindowStyle.Hidden;
            server.EnvironmentVariables["PORT"] = port.ToString();
            server.EnvironmentVariables["BASMA_HOST"] = "127.0.0.1";
            try { Process.Start(server); }
            catch (Exception ex)
            {
                ShowError("تعذر تشغيل خدمة البرنامج:\n" + ex.Message);
                return;
            }

            bool ready = false;
            for (int i = 0; i < 50; i++)
            {
                if (IsOurServer(port)) { ready = true; break; }
                Thread.Sleep(400);
            }
            if (!ready)
            {
                ShowError("لم تستجب خدمة البرنامج. تحقق من تثبيت Node.js ثم حاول مرة أخرى.");
                return;
            }
        }

        string url = "http://127.0.0.1:" + port + "/";
        string browser = FindBrowser();
        try
        {
            if (browser != null)
            {
                ProcessStartInfo app = new ProcessStartInfo();
                app.FileName = browser;
                app.Arguments = "--app=\"" + url + "\" --new-window";
                app.WorkingDirectory = root;
                app.UseShellExecute = false;
                Process.Start(app);
            }
            else
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
        }
        catch (Exception ex) { ShowError("تعذر فتح نافذة البرنامج:\n" + ex.Message); }
    }
}
