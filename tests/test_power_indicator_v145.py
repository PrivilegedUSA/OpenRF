"""Header battery is a real optional kernel report, never a synthetic 0%."""
import tempfile
import unittest
from pathlib import Path

from openrf.device_survival import power_status


class HeaderPowerTests(unittest.TestCase):
    def test_no_battery_means_unknown_even_if_on_mains(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            mains=root/'AC';mains.mkdir()
            (mains/'type').write_text('Mains')
            (mains/'online').write_text('1')
            result=power_status(power_root=root)
            self.assertEqual(result['battery']['state'],'NOT_REPORTED')
            self.assertEqual(result['battery']['batteries'],[])
            self.assertIsNone(result['battery']['runtime_estimate_minutes'])
            self.assertTrue(result['read_only'])

    def test_kernel_reported_percentage_and_unusable_capacity(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);battery=root/'BAT0';battery.mkdir()
            (battery/'type').write_text('Battery')
            (battery/'capacity').write_text('67\n')
            (battery/'status').write_text('Charging\n')
            result=power_status(power_root=root)
            self.assertEqual(result['battery']['batteries'][0]['capacity_percent'],67)
            self.assertEqual(result['battery']['batteries'][0]['status'],'Charging')
            (battery/'capacity').write_text('INVALID')
            self.assertIsNone(power_status(power_root=root)['battery']['batteries'][0]['capacity_percent'])
            (battery/'capacity').write_text('0')
            self.assertEqual(power_status(power_root=root)['battery']['batteries'][0]['capacity_percent'],0)


if __name__=='__main__':unittest.main()
