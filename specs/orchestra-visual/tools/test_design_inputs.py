"""Design inputs and regressions; these are NOT product rendering tests."""
import copy,json,tempfile,unittest
from pathlib import Path
from validate_design_inputs import ROOT,verify,check_states,check_copy,path
from validate_plan import validate
from effective_contract import contract_digest
from executor import widget_extract
from test_support import install

class DesignInputs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan=json.loads((ROOT/'PLAN.json').read_text());cls.surfaces=json.loads((ROOT/'SURFACES.json').read_text());cls.states=json.loads((ROOT/'design/STATES.json').read_text());cls.copy=json.loads((ROOT/'copy.json').read_text())
    def test_01_complete_assets_render_and_no_product_claim(self):
        r=verify();self.assertEqual(r['errors'],[]);self.assertFalse(r['product_implementation_tested']);self.assertEqual(r['counts']['states'],22)
    def test_02_missing_state_rejected(self):
        x=copy.deepcopy(self.states);x['states'].pop();self.assertTrue(check_states(x,self.surfaces))
    def test_03_duplicate_state_rejected(self):
        x=copy.deepcopy(self.states);x['states'][-1]=x['states'][0];self.assertTrue(check_states(x,self.surfaces))
    def test_04_wrong_viewport_rejected(self):
        x=copy.deepcopy(self.states);x['states'][0]['viewport']=[1,1];self.assertTrue(check_states(x,self.surfaces))
    def test_05_reference_cannot_be_product_evidence(self):
        x=copy.deepcopy(self.states);x['states'][0]['is_product_evidence']=True;self.assertTrue(check_states(x,self.surfaces))
    def test_06_unknown_consumer_rejected(self):
        x=copy.deepcopy(self.states);x['states'][0]['consumer_hints']=['UI9999'];self.assertTrue(check_states(x,self.surfaces))
    def test_07_duplicate_copy_key_rejected(self):
        x=copy.deepcopy(self.copy);x['entries'].append(x['entries'][0]);self.assertTrue(check_copy(x))
    def test_08_empty_copy_rejected(self):
        x=copy.deepcopy(self.copy);x['entries'][0]['pt-BR']='';self.assertTrue(check_copy(x))
    def test_09_placeholder_mismatch_rejected(self):
        x=copy.deepcopy(self.copy);x['entries'][0]['en']+=' {missing}';self.assertTrue(check_copy(x))
    def test_10_translation_writer_preserved(self):
        x=copy.deepcopy(self.copy);x['entries'][0]['owner']='S25';self.assertTrue(check_copy(x))
    def test_11_unsafe_asset_path_rejected(self):
        for value in ('../secret','/tmp/secret','design\\file',''):
            with self.subTest(value=value),self.assertRaises(ValueError):path(ROOT,value)
    def test_12_design_packet_is_literal_and_scoped(self):
        text=(ROOT/'design/EXECUTOR-DECISIONS.md').read_text();out=widget_extract(text,['A09'],prefix='a')
        self.assertIn('## A09',out);self.assertNotIn('## A10',out);self.assertIn('tabID + generation',out)
    def test_13_missing_design_section_fails_closed(self):
        with self.assertRaises(ValueError):widget_extract('<a id="a01"></a>\nOne',['A09'],prefix='a')
    def test_14_invalid_plan_design_assignment_rejected(self):
        x=copy.deepcopy(self.plan);x['nodes'][0]['design_sections']=['A99'];self.assertTrue(validate(x,self.surfaces))
    def test_15_design_decisions_bind_receipts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);install(root);n=next(n for n in self.plan['nodes'] if n['id']=='S16-W1-T1');old=contract_digest(n,root,self.plan)
            f=root/'design/EXECUTOR-DECISIONS.md';f.write_text(f.read_text()+'\nChanged design constraint.\n');self.assertNotEqual(old,contract_digest(n,root,self.plan))
    def test_16_version_does_not_disable_prior_guards(self):
        x=copy.deepcopy(self.plan);next(n for n in x['nodes'] if n['id']=='S18-W1-T1')['widget_contracts']=['W99'];self.assertTrue(validate(x,self.surfaces))
        x=copy.deepcopy(self.plan);next(n for n in x['nodes'] if n['id']=='S25-W1-T2')['resource_locks'].append('exclusive-benchmark-hardware');self.assertTrue(validate(x,self.surfaces))
if __name__=='__main__':unittest.main()
