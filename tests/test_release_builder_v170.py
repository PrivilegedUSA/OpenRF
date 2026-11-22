"""Synthetic release fixtures; does not collect personal investigation data."""
import importlib.util
import json
import tempfile
import unittest
import zlib
from pathlib import Path
from zipfile import ZipFile


spec = importlib.util.spec_from_file_location('openrf_release_builder',
    Path(__file__).resolve().parents[1]/'tools'/'build_release_zip.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ReleaseBuilderTests(unittest.TestCase):
    def test_valid_manifest_only_managed_files_and_crc(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            root = base/'source'
            project = root/'project'
            project.mkdir(parents=True)
            (root/'openrf-bundle.json').write_text(json.dumps({
                'project':'OpenRF','formatVersion':1,'version':'0.2.176'}))
            (project/'app.py').write_text('print("hello")\n')
            (project/'__pycache__').mkdir()
            (project/'__pycache__'/'bad.pyc').write_bytes(b'NOT A SOURCE FILE')
            (root/'Update-OpenRF.ps1').write_text('LOCAL UPDATER STAYS OUTSIDE BUNDLE')
            output=base/'OpenRF-v0.2.176.zip'
            result=builder.build(root,output)
            self.assertEqual(result['version'],'0.2.176')
            with ZipFile(output) as archive:
                self.assertIsNone(archive.testzip())
                self.assertIn('project/app.py',archive.namelist())
                self.assertNotIn('project/__pycache__/bad.pyc',archive.namelist())
                self.assertNotIn('Update-OpenRF.ps1',archive.namelist())
                self.assertTrue(all(not entry.extra for entry in archive.infolist()))

    def test_filename_and_reserved_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp)
            root=base/'source'
            project=root/'project'
            project.mkdir(parents=True)
            (root/'openrf-bundle.json').write_text(json.dumps({
                'project':'OpenRF','formatVersion':1,'version':'0.2.176'}))
            with self.assertRaisesRegex(ValueError,'filename'):
                builder.build(root,base/'wrong.zip')
            (project/'local-data').mkdir()
            (project/'local-data'/'private.log').write_text('PRIVATE')
            with self.assertRaisesRegex(ValueError,'Reserved'):
                builder.build(root,base/'OpenRF-v0.2.176.zip')

    def test_site_icon_variants_have_real_transparent_rounded_corners(self):
        asset_dir=Path(__file__).resolve().parents[1]/'openrf'/'static'/'assets'
        for size in (32,180,192,512):
            with self.subTest(size=size):
                data=(asset_dir/f'openrf-icon-{size}.png').read_bytes()
                self.assertEqual(data[:8],b'\x89PNG\r\n\x1a\n')
                self.assertEqual(data[25],6,'PNG must use true RGBA, not opaque RGB')
                self.assertEqual((int.from_bytes(data[16:20],'big'),
                                  int.from_bytes(data[20:24],'big')),(size,size))
                offset,parts=8,[]
                while offset<len(data):
                    length=int.from_bytes(data[offset:offset+4],'big')
                    typ=data[offset+4:offset+8]
                    if typ==b'IDAT':
                        parts.append(data[offset+8:offset+8+length])
                    offset+=length+12
                    if typ==b'IEND':
                        break
                first_row=zlib.decompress(b''.join(parts))[:5]
                self.assertIn(first_row[0],range(5))
                self.assertLess(first_row[4],16,'Outside tile corner must be transparent')


if __name__=='__main__':
    unittest.main()
