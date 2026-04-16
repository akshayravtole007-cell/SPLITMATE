const pool = require('../config/database');

exports.createExpense = async (req, res) => {
  const { groupId } = req.params;
  const { description, amount, paidBy, splitType = 'equal', splits = [], category = 'general', date, notes } = req.body;

  if (!description?.trim() || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Description and valid amount are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify membership
    const memberCheck = await client.query(
      'SELECT user_id FROM group_members WHERE group_id = $1',
      [groupId]
    );
    const memberIds = memberCheck.rows.map(r => r.user_id);

    if (!memberIds.includes(paidBy || req.user.id)) {
      return res.status(403).json({ error: 'Payer must be a group member' });
    }

    const expenseResult = await client.query(
      `INSERT INTO expenses (group_id, description, amount, paid_by, split_type, category, date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        groupId, description.trim(), parseFloat(amount),
        paidBy || req.user.id, splitType, category,
        date || new Date().toISOString().split('T')[0], notes || null, req.user.id
      ]
    );
    const expense = expenseResult.rows[0];

    // Calculate splits
    let splitData = [];
    const totalAmount = parseFloat(amount);

    if (splitType === 'equal') {
      const splitAmount = totalAmount / memberIds.length;
      splitData = memberIds.map(userId => ({ userId, amount: parseFloat(splitAmount.toFixed(2)) }));
    } else if (splitType === 'custom') {
      // splits is array of { userId, amount }
      splitData = splits.map(s => ({ userId: s.userId, amount: parseFloat(s.amount) }));
    } else if (splitType === 'percentage') {
      // splits is array of { userId, percentage }
      splitData = splits.map(s => ({
        userId: s.userId,
        amount: parseFloat(((s.percentage / 100) * totalAmount).toFixed(2))
      }));
    }

    for (const split of splitData) {
      await client.query(
        'INSERT INTO expense_splits (expense_id, user_id, amount) VALUES ($1, $2, $3)',
        [expense.id, split.userId, split.amount]
      );
    }

    await client.query('COMMIT');

    const fullExpense = await pool.query(
      `SELECT e.*, u.name as paid_by_name, u.avatar_color as paid_by_color
       FROM expenses e JOIN users u ON e.paid_by = u.id WHERE e.id = $1`,
      [expense.id]
    );

    res.status(201).json({ expense: fullExpense.rows[0], splits: splitData });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create expense error:', err);
    res.status(500).json({ error: 'Failed to create expense' });
  } finally {
    client.release();
  }
};

exports.getExpense = async (req, res) => {
  const { expenseId } = req.params;
  try {
    const expenseResult = await pool.query(
      `SELECT e.*, u.name as paid_by_name, u.avatar_color as paid_by_color
       FROM expenses e JOIN users u ON e.paid_by = u.id WHERE e.id = $1`,
      [expenseId]
    );
    if (expenseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const splitsResult = await pool.query(
      `SELECT es.*, u.name, u.email, u.avatar_color
       FROM expense_splits es JOIN users u ON es.user_id = u.id
       WHERE es.expense_id = $1`,
      [expenseId]
    );

    res.json({ expense: expenseResult.rows[0], splits: splitsResult.rows });
  } catch (err) {
    console.error('Get expense error:', err);
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
};

exports.deleteExpense = async (req, res) => {
  const { expenseId } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM expenses WHERE id = $1 AND created_by = $2 RETURNING id',
      [expenseId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized to delete this expense' });
    }
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    // Total you owe others
    const youOweResult = await pool.query(
      `SELECT COALESCE(SUM(es.amount), 0) as total
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE es.user_id = $1 AND e.paid_by != $1 AND es.is_settled = FALSE`,
      [req.user.id]
    );

    // Total others owe you
    const owedToYouResult = await pool.query(
      `SELECT COALESCE(SUM(es.amount), 0) as total
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE e.paid_by = $1 AND es.user_id != $1 AND es.is_settled = FALSE`,
      [req.user.id]
    );

    // Recent expenses
    const recentExpenses = await pool.query(
      `SELECT e.*, u.name as paid_by_name, u.avatar_color as paid_by_color, g.name as group_name
       FROM expenses e
       JOIN users u ON e.paid_by = u.id
       JOIN groups g ON e.group_id = g.id
       JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = $1
       ORDER BY e.created_at DESC LIMIT 10`,
      [req.user.id]
    );

    // Per-user balances
    const balancesResult = await pool.query(
      `SELECT 
        CASE WHEN e.paid_by = $1 THEN es.user_id ELSE e.paid_by END as other_user_id,
        CASE WHEN e.paid_by = $1 THEN SUM(es.amount) ELSE -SUM(es.amount) END as net
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE (es.user_id = $1 OR e.paid_by = $1)
         AND es.user_id != e.paid_by
         AND es.is_settled = FALSE
       GROUP BY other_user_id, e.paid_by`,
      [req.user.id]
    );

    // Get user details for balance entries
    const userIds = [...new Set(balancesResult.rows.map(r => r.other_user_id))];
    let userDetails = [];
    if (userIds.length > 0) {
      const usersResult = await pool.query(
        'SELECT id, name, email, avatar_color FROM users WHERE id = ANY($1)',
        [userIds]
      );
      userDetails = usersResult.rows;
    }

    const userMap = {};
    userDetails.forEach(u => { userMap[u.id] = u; });

    // Aggregate balances per user
    const netBalances = {};
    balancesResult.rows.forEach(row => {
      const uid = row.other_user_id;
      if (!netBalances[uid]) netBalances[uid] = 0;
      netBalances[uid] += parseFloat(row.net);
    });

    const friendBalances = Object.entries(netBalances)
      .filter(([uid]) => userMap[uid])
      .map(([uid, net]) => ({ user: userMap[uid], net: parseFloat(net.toFixed(2)) }));

    res.json({
      youOwe: parseFloat(youOweResult.rows[0].total),
      owedToYou: parseFloat(owedToYouResult.rows[0].total),
      netBalance: parseFloat(owedToYouResult.rows[0].total) - parseFloat(youOweResult.rows[0].total),
      recentExpenses: recentExpenses.rows,
      friendBalances,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
};
