const supabase = require('../../../lib/supabase');

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  try {
    const { data, error } = await supabase
      .from('files')
      .select('id, path, filename, extension, current_version, last_modified')
      .eq('project_id', id)
      .order('path', { ascending: true });

    if (error) throw error;

    // Build tree structure from flat paths
    const tree = {};
    data.forEach(file => {
      const parts = file.path.split('/');
      let current = tree;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // It's a file
          current[part] = {
            type: 'file',
            id: file.id,
            path: file.path,
            extension: file.extension,
            current_version: file.current_version,
            last_modified: file.last_modified
          };
        } else {
          // It's a directory
          if (!current[part]) {
            current[part] = { type: 'dir', children: {} };
          }
          current = current[part].children;
        }
      });
    });

    res.status(200).json({ tree, files: data });
  } catch (err) {
    console.error('Error fetching file tree:', err);
    res.status(500).json({ error: err.message });
  }
};