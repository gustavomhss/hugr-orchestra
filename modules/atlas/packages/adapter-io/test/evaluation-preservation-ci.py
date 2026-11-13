"""Synthetic temporary trees only; test the exact public helper imported by runner."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
HELPER=Path(__file__).resolve().parents[1]/'script/evaluation-preservation.py'
spec=importlib.util.spec_from_file_location('preservation',HELPER)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Preservation(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);(self.root/'file').write_text('synthetic');(self.root/'dir').mkdir()
 def test_unchanged(self):
  before=m.snapshot(self.root);result={'cleanup_errors':[]};self.assertEqual(m.record_after(result,'RUNTIME',self.root,before),before);self.assertEqual(result['cleanup_errors'],[])
 def test_content(self):
  before=m.snapshot(self.root);(self.root/'file').write_text('different');self.assertNotEqual(m.snapshot(self.root),before)
 def test_file_mode(self):
  before=m.snapshot(self.root);os.chmod(self.root/'file',0o600);self.assertNotEqual(m.snapshot(self.root),before)
 def test_add_remove(self):
  before=m.snapshot(self.root);(self.root/'added').write_text('a');self.assertNotEqual(m.snapshot(self.root),before);(self.root/'added').unlink();(self.root/'file').unlink();self.assertNotEqual(m.snapshot(self.root),before)
 def test_symlink_not_followed(self):
  os.symlink('absent',self.root/'link');before=m.snapshot(self.root);self.assertEqual(before['link']['target'],'absent');(self.root/'link').unlink();os.symlink('another-absent',self.root/'link');self.assertNotEqual(m.snapshot(self.root),before)
 def test_root_mode(self):
  before=m.snapshot(self.root);self.assertIn('.',before);os.chmod(self.root,0o700 if (self.root.stat().st_mode&0o777)!=0o700 else 0o750);self.assertNotEqual(m.snapshot(self.root),before)
 def test_root_symlink_refused(self):
  alias=self.root/'alias';os.symlink(self.root/'dir',alias)
  with self.assertRaisesRegex(RuntimeError,'ROOT_NOT_DIRECTORY'):m.snapshot(alias)
 def test_missing_root_refused(self):
  with self.assertRaises(FileNotFoundError):m.snapshot(self.root/'missing')
 def test_directory_mode(self):
  before=m.snapshot(self.root);os.chmod(self.root/'dir',0o700);self.assertNotEqual(m.snapshot(self.root),before)
 def test_fifo_refused_without_read(self):
  os.mkfifo(self.root/'pipe')
  with self.assertRaisesRegex(RuntimeError,'UNEXPECTED_TYPE'):m.snapshot(self.root)
 def test_enumeration_failure(self):
  def walk(*args,**kw):kw['onerror'](PermissionError('synthetic enumeration failure'));yield
  with mock.patch.object(m.os,'walk',walk):
   with self.assertRaises(PermissionError):m.snapshot(self.root)
 def test_disappearing_path_refused(self):
  original=Path.lstat
  def fail(path,*a,**kw):
   if path.name=='file':raise FileNotFoundError('synthetic disappearance')
   return original(path,*a,**kw)
  with mock.patch.object(Path,'lstat',fail):
   with self.assertRaises(FileNotFoundError):m.snapshot(self.root)
 def test_C_and_runtime_change_route_failure(self):
  for label in ['PRIOR_C51','SHARED_READONLY_RUNTIME']:
   with self.subTest(label=label):
    before=m.snapshot(self.root);(self.root/'file').write_text(label);result={'cleanup_errors':[]};self.assertIsNotNone(m.record_after(result,label,self.root,before));self.assertEqual(result['cleanup_errors'],[label+'_CHANGED'])
 def test_unknown_routes_failure_not_equal_empty(self):
  before=m.snapshot(self.root);result={'cleanup_errors':[]}
  with mock.patch.object(m,'snapshot',side_effect=PermissionError('synthetic')):self.assertIsNone(m.record_after(result,'RUNTIME',self.root,before))
  self.assertEqual(result['cleanup_errors'],['RUNTIME_PRESERVATION_UNKNOWN:PermissionError'])
if __name__=='__main__':unittest.main(verbosity=2)
