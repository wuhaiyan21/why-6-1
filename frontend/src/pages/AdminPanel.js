import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { courseAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AdminPanel() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [formError, setFormError] = useState('');
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    capacity: '',
    startDate: '',
    isActive: true,
    prerequisites: [],
  });

  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAdmin) {
      loadCourses();
    }
  }, [isAdmin]);

  const loadCourses = async () => {
    try {
      setLoading(true);
      const data = await courseAPI.getCoursesAdmin();
      setCourses(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCourse(null);
    setFormError('');
    setFormData({
      title: '',
      description: '',
      capacity: '',
      startDate: '',
      isActive: true,
      prerequisites: [],
    });
    setShowModal(true);
  };

  const handleEdit = (course) => {
    setEditingCourse(course);
    setFormError('');
    setFormData({
      title: course.title,
      description: course.description || '',
      capacity: course.capacity,
      startDate: new Date(course.startDate).toISOString().slice(0, 16),
      isActive: course.isActive,
      prerequisites: [],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    try {
      const courseData = {
        title: formData.title,
        description: formData.description,
        capacity: parseInt(formData.capacity, 10),
        startDate: new Date(formData.startDate).toISOString(),
        isActive: formData.isActive,
        prerequisites: formData.prerequisites,
      };

      if (editingCourse) {
        await courseAPI.updateCourse(editingCourse.id, courseData);
      } else {
        await courseAPI.createCourse(courseData);
      }

      setShowModal(false);
      loadCourses();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleClose = async (courseId) => {
    if (!window.confirm('确定要关闭该课程的报名吗？')) {
      return;
    }
    try {
      setError('');
      await courseAPI.closeCourse(courseId);
      loadCourses();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReopen = async (courseId) => {
    if (!window.confirm('确定要重新开启该课程的报名吗？')) {
      return;
    }
    try {
      setError('');
      await courseAPI.reopenCourse(courseId);
      loadCourses();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (courseId) => {
    if (!window.confirm('确定要删除该课程吗？此操作不可撤销。')) {
      return;
    }
    try {
      await courseAPI.deleteCourse(courseId);
      loadCourses();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!isAdmin) {
    return (
      <div style={styles.container}>
        <div style={styles.noAccess}>
          <h2>无访问权限</h2>
          <p>您需要管理员权限才能访问此页面</p>
          <button onClick={() => navigate('/')} style={styles.backBtn}>
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div style={styles.loading}>加载中...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>课程管理</h1>
        <button onClick={handleCreate} style={styles.createBtn}>
          + 新建课程
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>课程名称</th>
              <th style={styles.th}>总名额</th>
              <th style={styles.th}>已报名</th>
              <th style={styles.th}>剩余名额</th>
              <th style={styles.th}>开课时间</th>
              <th style={styles.th}>状态</th>
              <th style={styles.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {courses.map(course => (
              <tr key={course.id} style={styles.tableRow}>
                <td style={styles.td}>
                  <span style={styles.courseName}>{course.title}</span>
                </td>
                <td style={styles.td}>{course.capacity}</td>
                <td style={styles.td}>{course.enrolledCount}</td>
                <td style={styles.td}>
                  <span style={{
                    color: course.remainingSlots > 0 ? '#16a34a' : '#dc2626',
                    fontWeight: '500',
                  }}>
                    {course.remainingSlots}
                  </span>
                </td>
                <td style={styles.td}>{formatDate(course.startDate)}</td>
                <td style={styles.td}>
                  {course.isActive ? (
                    <span style={styles.statusActive}>招生中</span>
                  ) : (
                    <span style={styles.statusClosed}>已关闭</span>
                  )}
                </td>
                <td style={styles.td}>
                  <div style={styles.actions}>
                    <button
                      onClick={() => handleEdit(course)}
                      style={styles.actionBtn}
                    >
                      编辑
                    </button>
                    {course.isActive ? (
                      <button
                        onClick={() => handleClose(course.id)}
                        style={{ ...styles.actionBtn, color: '#d97706' }}
                      >
                        关闭
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReopen(course.id)}
                        style={{ ...styles.actionBtn, color: '#16a34a' }}
                      >
                        开启
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(course.id)}
                      style={{ ...styles.actionBtn, color: '#dc2626' }}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {courses.length === 0 && (
          <div style={styles.empty}>暂无课程</div>
        )}
      </div>

      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>
              {editingCourse ? '编辑课程' : '新建课程'}
            </h2>

            <form onSubmit={handleSubmit} style={styles.form}>
              {formError && <div style={styles.modalError}>{formError}</div>}

              <div style={styles.field}>
                <label style={styles.label}>课程名称</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>课程描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={styles.textarea}
                  rows={4}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>
                  名额数量
                  {editingCourse && (
                    <span style={styles.hint}>（当前已报名 {editingCourse.enrolledCount} 人）</span>
                  )}
                </label>
                <input
                  type="number"
                  min={editingCourse ? editingCourse.enrolledCount : 1}
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>开课时间</label>
                <input
                  type="datetime-local"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  style={styles.input}
                  required
                />
              </div>

              {editingCourse && (
                <div style={styles.field}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    <span style={{ marginLeft: '0.5rem' }}>开启报名</span>
                  </label>
                </div>
              )}

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={styles.cancelBtn}
                >
                  取消
                </button>
                <button type="submit" style={styles.submitBtn}>
                  {editingCourse ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem 1rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: 0,
  },
  createBtn: {
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.625rem 1.25rem',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  loading: {
    textAlign: 'center',
    padding: '3rem',
    fontSize: '1.1rem',
    color: '#64748b',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    marginBottom: '1rem',
  },
  modalError: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    marginBottom: '0.5rem',
  },
  hint: {
    fontSize: '0.8rem',
    color: '#64748b',
    fontWeight: 'normal',
    marginLeft: '0.5rem',
  },
  tableContainer: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
  },
  th: {
    padding: '0.875rem 1rem',
    textAlign: 'left',
    fontWeight: '600',
    color: '#475569',
    fontSize: '0.875rem',
    borderBottom: '1px solid #e2e8f0',
  },
  tableRow: {
    borderBottom: '1px solid #f1f5f9',
  },
  td: {
    padding: '0.875rem 1rem',
    fontSize: '0.95rem',
    color: '#334155',
  },
  courseName: {
    fontWeight: '500',
    color: '#1e293b',
  },
  statusActive: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.8rem',
    fontWeight: '500',
  },
  statusClosed: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.8rem',
    fontWeight: '500',
  },
  actions: {
    display: 'flex',
    gap: '0.5rem',
  },
  actionBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    cursor: 'pointer',
    fontSize: '0.85rem',
    padding: '0.25rem 0.5rem',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem',
    color: '#64748b',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '2rem',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: '#1e293b',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.9rem',
    fontWeight: '500',
    color: '#334155',
  },
  input: {
    padding: '0.625rem 0.875rem',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '1rem',
    outline: 'none',
  },
  textarea: {
    padding: '0.625rem 0.875rem',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '1rem',
    outline: 'none',
    resize: 'vertical',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.9rem',
    color: '#334155',
  },
  modalActions: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
    marginTop: '1.5rem',
  },
  cancelBtn: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: 'none',
    padding: '0.625rem 1.25rem',
    borderRadius: '8px',
    fontSize: '0.95rem',
    cursor: 'pointer',
  },
  submitBtn: {
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.625rem 1.25rem',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  noAccess: {
    textAlign: 'center',
    padding: '4rem 2rem',
    backgroundColor: 'white',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
  },
  backBtn: {
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.75rem 2rem',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    marginTop: '1rem',
  },
};

export default AdminPanel;
