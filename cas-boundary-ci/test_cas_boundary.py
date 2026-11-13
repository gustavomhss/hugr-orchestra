"""Synthetic standard-library tests, no repository corpus or native product."""
import unittest,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('boundary',Path(__file__).with_name('cas_boundary.py'));g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
class Boundary(unittest.TestCase):
 def fixture(self):
  h='a'*64;p=g.cas_path(h);before={'.atlas/cas':{'type':'directory'}};after={**before,'.atlas/cas/aa':{'type':'directory'},p:{'type':'file','sha256':'b'*64}};audit={p:{'id':h,'sha256':'b'*64}};return h,p,before,after,audit
 def test_exact_positive(self):
  h,p,b,a,i=self.fixture();self.assertEqual(g.validate(b,a,[h],i)['new_cas_files'],1)
 def test_extra_cas_valid_identity_rejected(self):
  h,p,b,a,i=self.fixture();extra='c'*64;q=g.cas_path(extra);a['.atlas/cas/cc']={'type':'directory'};a[q]={'type':'file','sha256':'d'*64};i[q]={'id':extra,'sha256':'d'*64}
  with self.assertRaisesRegex(RuntimeError,'CAS_EXACT_DELTA'):g.validate(b,a,[h],i)
 def test_extra_empty_directory_rejected(self):
  h,p,b,a,i=self.fixture();a['.atlas/cas/ff']={'type':'directory'}
  with self.assertRaisesRegex(RuntimeError,'CAS_DIRECTORY_SET'):g.validate(b,a,[h],i)
 def test_missing_expected_rejected(self):
  h,p,b,a,i=self.fixture();a.pop(p);i.pop(p)
  with self.assertRaisesRegex(RuntimeError,'CAS_EXACT_DELTA'):g.validate(b,a,[h],i)
 def test_bad_id_rejected(self):
  h,p,b,a,i=self.fixture()
  with self.assertRaisesRegex(RuntimeError,'CAS_ID_FORMAT'):g.validate(b,a,['../escape'],i)
 def test_raw_sha_not_kernel_identity(self):
  h,p,b,a,i=self.fixture();i[p]['id']='b'*64
  with self.assertRaisesRegex(RuntimeError,'CAS_KERNEL_AUDIT_BINDING'):g.validate(b,a,[h],i)
 def test_audit_capture_bytes_drift(self):
  h,p,b,a,i=self.fixture();i[p]['sha256']='c'*64
  with self.assertRaisesRegex(RuntimeError,'CAS_KERNEL_AUDIT_BINDING'):g.validate(b,a,[h],i)
 def test_existing_cas_changed(self):
  h,p,b,a,i=self.fixture();b=dict(a);a={**a,p:{'type':'file','sha256':'c'*64}}
  with self.assertRaisesRegex(RuntimeError,'CAS_BASELINE_CHANGED'):g.validate(b,a,[h],i)
if __name__=='__main__':unittest.main(verbosity=2)
