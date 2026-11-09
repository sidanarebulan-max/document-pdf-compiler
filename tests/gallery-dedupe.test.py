import importlib.util, unittest
spec=importlib.util.spec_from_file_location('dedupe','tests/gallery-dedupe.py');dedupe=importlib.util.module_from_spec(spec);spec.loader.exec_module(dedupe)
class DeduplicationTest(unittest.TestCase):
    def test_renamed_exact_files_are_duplicates_and_oldest_is_kept(self):
        rows=[{'id':'b','created_at':'2026-11-09','sha256':dedupe.fingerprint(b'image'),'name':'renamed.jpg'}, {'id':'a','created_at':'2026-11-08','sha256':dedupe.fingerprint(b'image'),'name':'original.jpg'}]
        groups=dedupe.duplicate_groups(rows);self.assertEqual([[r['id'] for r in g] for g in groups],[['a','b']])
    def test_same_name_different_contents_are_preserved(self):
        rows=[{'id':str(i),'created_at':'2026-11-09','name':'poster.jpg','sha256':dedupe.fingerprint(data)} for i,data in enumerate([b'poster-a',b'poster-b'])]
        self.assertEqual(len(dedupe.duplicate_groups(rows)),2)
if __name__=='__main__':unittest.main()
