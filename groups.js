const pool = require('../config/database');

exports.createGroup = async (req, res) => {
  const { name, description, icon, memberEmails = [] } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Group name is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const groupResult = await client.query(
      `INSERT INTO groups (name, description, icon, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), description?.trim() || null, icon || '🏠', req.user.id]
    );
    const group = groupResult.rows[0];

    // Add creator as member
    await client.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, req.user.id]
    );

    // Add other members by email
    const addedMembers = [];
    for (const email of memberEmails) {
      const userResult = await client.query(
        'SELECT id, name, email, avatar_color FROM users WHERE email = $1',
        [email.toLowerCase()]
      );
      if (userResult.rows.length > 0) {
        const member = userResult.rows[0];
        if (member.id !== req.user.id) {
          await client.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [group.id, member.id]
          );
          addedMembers.push(member);
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ group, addedMembers });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Failed to create group' });
  } finally {
    client.release();
  }
};

exports.getGroups = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*, 
        COUNT(DISTINCT gm.user_id) as member_count,
        COUNT(DISTINCT e.id) as expense_count,
        COALESCE(SUM(e.amount), 0) as total_spent
       FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       LEFT JOIN group_members gm2 ON g.id = gm2.group_id
       LEFT JOIN expenses e ON g.id = e.group_id
       WHERE gm.user_id = $1
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json({ groups: result.rows });
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
};

exports.getGroup = async (req, res) => {
  const { groupId } = req.params;
  try {
    // Verify membership
    const memberCheck = await pool.query(
      'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const groupResult = await pool.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const membersResult = await pool.query(
      `SELECT u.id, u.name, u.email, u.avatar_color, gm.joined_at
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1`,
      [groupId]
    );

    const expensesResult = await pool.query(
      `SELECT e.*, u.name as paid_by_name, u.avatar_color as paid_by_color
       FROM expenses e
       JOIN users u ON e.paid_by = u.id
       WHERE e.group_id = $1
       ORDER BY e.date DESC, e.created_at DESC`,
      [groupId]
    );

    res.json({
      group: groupResult.rows[0],
      members: membersResult.rows,
      expenses: expensesResult.rows,
    });
  } catch (err) {
    console.error('Get group error:', err);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
};

exports.addMember = async (req, res) => {
  const { groupId } = req.params;
  const { email } = req.body;

  try {
    const userResult = await pool.query(
      'SELECT id, name, email, avatar_color FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found with that email' });
    }
    const newMember = userResult.rows[0];

    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [groupId, newMember.id]
    );

    res.json({ message: 'Member added', member: newMember });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

exports.getBalances = async (req, res) => {
  const { groupId } = req.params;
  try {
    // Get all splits with who owes what
    const splitsResult = await pool.query(
      `SELECT 
        es.user_id as owes_user_id,
        e.paid_by as paid_by_user_id,
        SUM(es.amount) as amount
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE e.group_id = $1 AND es.user_id != e.paid_by AND es.is_settled = FALSE
       GROUP BY es.user_id, e.paid_by`,
      [groupId]
    );

    // Get user details for group
    const membersResult = await pool.query(
      `SELECT u.id, u.name, u.avatar_color FROM users u
       JOIN group_members gm ON u.id = gm.user_id
       WHERE gm.group_id = $1`,
      [groupId]
    );

    const userMap = {};
    membersResult.rows.forEach(u => { userMap[u.id] = u; });

    const balances = splitsResult.rows.map(row => ({
      owes: userMap[row.owes_user_id],
      owedTo: userMap[row.paid_by_user_id],
      amount: parseFloat(row.amount),
    })).filter(b => b.owes && b.owedTo);

    res.json({ balances });
  } catch (err) {
    console.error('Get balances error:', err);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
};

exports.settle = async (req, res) => {
  const { groupId } = req.params;
  const { paidTo, amount, note } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Record settlement
    await client.query(
      `INSERT INTO settlements (group_id, paid_by, paid_to, amount, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [groupId, req.user.id, paidTo, amount, note || null]
    );

    // Mark relevant splits as settled
    await client.query(
      `UPDATE expense_splits es
       SET is_settled = TRUE, settled_at = NOW()
       FROM expenses e
       WHERE es.expense_id = e.id
         AND e.group_id = $1
         AND es.user_id = $2
         AND e.paid_by = $3
         AND es.is_settled = FALSE`,
      [groupId, req.user.id, paidTo]
    );

    await client.query('COMMIT');
    res.json({ message: 'Settlement recorded' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Settle error:', err);
    res.status(500).json({ error: 'Failed to record settlement' });
  } finally {
    client.release();
  }
};
