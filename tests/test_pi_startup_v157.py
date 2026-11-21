"""v0.2.159: Raspberry Pi desktop startup is opt-in and limited to one stanza."""
import importlib.util
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "openrf-electron" / "pi-startup.py"
SPEC = importlib.util.spec_from_file_location("openrf_pi_startup_v157", SCRIPT)
pi = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pi)


class PiStartupTests(unittest.TestCase):
    def test_enable_idempotent_and_disable_preserves_other_app(self):
        with tempfile.TemporaryDirectory() as location:
            home = Path(location)
            autostart = pi.config_path(home)
            autostart.parent.mkdir(parents=True)
            original = "# User desktop startup\n/usr/bin/other-app &\n"
            autostart.write_text(original, encoding="utf-8")
            self.assertIn("disabled", pi.run("status", home))
            self.assertIn("enabled", pi.run("enable", home, launcher="/bin/true"))
            content = autostart.read_text(encoding="utf-8")
            self.assertTrue(content.startswith(original))
            self.assertIn("/bin/true --openrf-kiosk &", content)
            self.assertEqual(content.count(pi.BEGIN), 1)
            pi.run("enable", home, launcher="/bin/true")
            self.assertEqual(autostart.read_text(encoding="utf-8"), content)
            self.assertIn("enabled", pi.run("status", home))
            pi.run("disable", home)
            self.assertEqual(autostart.read_text(encoding="utf-8"), original)
            pi.run("disable", home)
            self.assertEqual(autostart.read_text(encoding="utf-8"), original)

    def test_missing_launcher_does_not_create_autostart(self):
        with tempfile.TemporaryDirectory() as location:
            home = Path(location)
            with self.assertRaisesRegex(ValueError, "missing or not executable"):
                pi.run("enable", home, launcher="/nonexistent/openrf-157")
            self.assertFalse(pi.config_path(home).exists())

    def test_malformed_markers_are_refused_and_preserved(self):
        with tempfile.TemporaryDirectory() as location:
            home = Path(location)
            target = pi.config_path(home)
            target.parent.mkdir(parents=True)
            original = "existing other app &\n" + pi.BEGIN + "\n"
            target.write_text(original, encoding="utf-8")
            for action in ("enable", "disable", "status"):
                with self.assertRaisesRegex(ValueError, "incomplete"):
                    pi.run(action, home, launcher="/bin/true")
                self.assertEqual(target.read_text(encoding="utf-8"), original)

    def test_symlink_autostart_is_refused(self):
        with tempfile.TemporaryDirectory() as location:
            home = Path(location)
            target = pi.config_path(home)
            target.parent.mkdir(parents=True)
            elsewhere = home / "important-file"
            elsewhere.write_text("keep me\n", encoding="utf-8")
            target.symlink_to(elsewhere)
            with self.assertRaisesRegex(ValueError, "symbolic-link"):
                pi.run("enable", home, launcher="/bin/true")
            self.assertEqual(elsewhere.read_text(encoding="utf-8"), "keep me\n")

    def test_quoted_launchers_and_only_marked_block(self):
        original = "some earlier process &\n"
        enabled = pi.updated_content(original, action="enable", launcher="/opt/My Apps/openrf")
        self.assertIn("'/opt/My Apps/openrf' --openrf-kiosk &", enabled)
        self.assertEqual(pi.updated_content(enabled, action="disable"), original)


if __name__ == "__main__":
    unittest.main()
