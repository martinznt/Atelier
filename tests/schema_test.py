"""Tests du vrai schéma SQLite ; ne remplacent pas les tests HTTP D1."""
import hashlib, pathlib, sqlite3, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parent.parent

class SchemaTest(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for file in sorted((ROOT/'migrations').glob('*.sql')):self.db.executescript(file.read_text())
  self.db.executemany('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)',[('a','alice','test-hash','2026-10-13'),('b','bob','test-hash','2026-10-13')])
  self.db.execute("INSERT INTO projects(id,user_id,name,created_at,updated_at) VALUES('pa','a','Projet A','2026-10-13','2026-10-13')")
 def tearDown(self):self.db.close()
 def test_foreign_keys_and_case_insensitive_username(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO users(id,username,password_hash,created_at) VALUES('c','ALICE','hash','date')")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO projects(id,user_id,name,created_at,updated_at) VALUES('x','absent','x','date','date')")
 def test_owner_filter_and_revision_conflict(self):
  self.assertIsNone(self.db.execute('SELECT * FROM projects WHERE id=? AND user_id=?',('pa','b')).fetchone())
  changed=self.db.execute('UPDATE projects SET name=?,revision=revision+1 WHERE id=? AND user_id=? AND revision=?',('Modifié','pa','a',1)).rowcount
  self.assertEqual(changed,1)
  self.assertEqual(self.db.execute('UPDATE projects SET name=?,revision=revision+1 WHERE id=? AND user_id=? AND revision=?',('Conflit','pa','a',1)).rowcount,0)
 def test_file_versions_are_immutable(self):
  self.db.execute("INSERT INTO files(id,user_id,project_id,name,mime,author,created_at,updated_at) VALUES('f','a','pa','test.txt','text/plain','a','date','date')")
  self.db.execute("INSERT INTO file_versions(id,file_id,user_id,version,size,sha256,object_key,state,created_at) VALUES('v1','f','a',1,3,'hash','a/f/v1','final','date')")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE file_versions SET size=99 WHERE id='v1'")
  self.db.execute("INSERT INTO file_versions(id,file_id,user_id,version,size,sha256,object_key,state,created_at) VALUES('v2','f','a',2,3,'hash','a/f/v2','final','date')")
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM file_versions').fetchone()[0],2)
 def test_idempotency_is_scoped_to_account(self):
  sql="INSERT INTO tasks(id,user_id,project_id,idempotency_key,request_hash,payload,context,created_at,updated_at) VALUES(?,?,?,?,?,'{}','{}','date','date')"
  self.db.execute(sql,('t','a','pa','key','hash'))
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute(sql,('t2','a','pa','key','hash'))
 def test_sqlite_backup_restore(self):
  with tempfile.TemporaryDirectory() as directory:
   dest=sqlite3.connect(str(pathlib.Path(directory)/'backup.sqlite'));self.db.commit();self.db.backup(dest);dest.close()
   restored=sqlite3.connect(str(pathlib.Path(directory)/'backup.sqlite'))
   self.assertEqual(restored.execute('PRAGMA integrity_check').fetchone()[0],'ok')
   self.assertEqual(restored.execute('SELECT name FROM projects WHERE id=?',('pa',)).fetchone()[0],'Projet A');restored.close()
 def test_account_cascade(self):
  self.db.execute("DELETE FROM users WHERE id='a'");self.assertEqual(self.db.execute('SELECT COUNT(*) FROM projects').fetchone()[0],0);self.assertEqual(self.db.execute('SELECT username FROM users').fetchone()[0],'bob')
if __name__=='__main__':unittest.main(verbosity=2)
