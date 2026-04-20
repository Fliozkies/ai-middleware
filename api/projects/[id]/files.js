const supabase = require('../../../lib/supabase');
const { generateEmbedding } = require('../../../lib/gemini');

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id, path } = req.query;

  // GET /projects/:id/files?path= - fetch file content by path
  if (req.method === 'GET') {
    if (!path) {
      return res.status(400).json({ error: 'path query parameter is required' });
    }

    try {
      // Get file record
      const { data: file, error: fileError } = await supabase
        .from('files')
        .select('id, path, filename, extension, current_version, last_modified')
        .eq('project_id', id)
        .eq('path', path)
        .single();

      if (fileError && fileError.code === 'PGRST116') {
        return res.status(404).json({ error: 'File not found' });
      }

      if (fileError) throw fileError;

      // Get latest version content
      const { data: version, error: versionError } = await supabase
        .from('file_versions')
        .select('id, version_number, content, size_bytes, changed_by, created_at')
        .eq('file_id', file.id)
        .eq('version_number', file.current_version)
        .single();

      if (versionError) throw versionError;

      res.status(200).json({ file, version });
    } catch (err) {
      console.error('Error fetching file:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // POST /projects/:id/files - create new file
  else if (req.method === 'POST') {
    const { path: filePath, filename, extension, content, changed_by } = req.body;

    if (!filePath || !filename || content === undefined) {
      return res.status(400).json({ error: 'path, filename, and content are required' });
    }

    try {
      // Generate embedding for the file content
      const embedding = await generateEmbedding(content.slice(0, 8000));

      // Create file record
      const { data: file, error: fileError } = await supabase
        .from('files')
        .insert({
          project_id: id,
          path: filePath,
          filename,
          extension: extension ?? filePath.split('.').pop(),
          current_version: 1,
          last_modified: new Date().toISOString()
        })
        .select()
        .single();

      if (fileError) throw fileError;

      // Create first version
      const { data: version, error: versionError } = await supabase
        .from('file_versions')
        .insert({
          file_id: file.id,
          version_number: 1,
          content,
          size_bytes: Buffer.byteLength(content, 'utf8'),
          embedding,
          changed_by: changed_by ?? 'claude'
        })
        .select()
        .single();

      if (versionError) throw versionError;

      res.status(201).json({ success: true, file, version });
    } catch (err) {
      console.error('Error creating file:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // PUT /projects/:id/files?path= - update file, create new version
  else if (req.method === 'PUT') {
    if (!path) {
      return res.status(400).json({ error: 'path query parameter is required' });
    }

    const { content, changed_by } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'content is required' });
    }

    try {
      // Get existing file
      const { data: file, error: fileError } = await supabase
        .from('files')
        .select('id, current_version')
        .eq('project_id', id)
        .eq('path', path)
        .single();

      if (fileError && fileError.code === 'PGRST116') {
        return res.status(404).json({ error: 'File not found' });
      }

      if (fileError) throw fileError;

      const newVersion = file.current_version + 1;

      // Generate embedding for new content
      const embedding = await generateEmbedding(content.slice(0, 8000));

      // Create new version
      const { data: version, error: versionError } = await supabase
        .from('file_versions')
        .insert({
          file_id: file.id,
          version_number: newVersion,
          content,
          size_bytes: Buffer.byteLength(content, 'utf8'),
          embedding,
          changed_by: changed_by ?? 'claude'
        })
        .select()
        .single();

      if (versionError) throw versionError;

      // Update current_version pointer
      const { error: updateError } = await supabase
        .from('files')
        .update({
          current_version: newVersion,
          last_modified: new Date().toISOString()
        })
        .eq('id', file.id);

      if (updateError) throw updateError;

      res.status(200).json({ success: true, version });
    } catch (err) {
      console.error('Error updating file:', err);
      res.status(500).json({ error: err.message });
    }
  }

  else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};