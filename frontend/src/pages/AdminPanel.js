import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { courseAPI, adminAPI } from '../services/api';
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

  const [activeTab, setActiveTab] = useState('courses');
  
  const [enrollments, setEnrollments] = useState([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  const [enrollmentFilter, setEnrollmentFilter] = useState({
    courseId: '',
    status: '',
    page: 1,
    limit: 20,
  });
  const [enrollmentPagination, setEnrollmentPagination] = useState({
    total: 0,
    totalPages: 0,
  });

  const [waitlists, setWaitlists] = useState([]);
  const [waitlistsLoading, setWaitlistsLoading] = useState(false);
  const [waitlistFilter, setWaitlistFilter] = useState({
    courseId: '',
    page: 1,
    limit: 20,
  });
  const [waitlistPagination, setWaitlistPagination] = useState({
    total: 0,
    totalPages: 0,
  });

  const [rejectModal, setRejectModal] = useState(false);
  const [rejectingEnrollmentId, setRejectingEnrollmentId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAdmin) {
      loadCourses();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && activeTab === 'enrollments') {
      loadEnrollments();
    }
  }, [isAdmin, activeTab, enrollmentFilter, loadEnrollments]);

  useEffect(() => {
    if (isAdmin && activeTab === 'waitlists') {
      loadWaitlists();
    }
  }, [isAdmin, activeTab, waitlistFilter, loadWaitlists]);

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

  const loadEnrollments = async () => {
    try {
      setEnrollmentsLoading(true);
      const params = {};
      if (enrollmentFilter.courseId) params.courseId = enrollmentFilter.courseId;
      if (enrollmentFilter.status) params.status = enrollmentFilter.status;
      params.page = enrollmentFilter.page;
      params.limit = enrollmentFilter.limit;

      const data = await adminAPI.getEnrollments(params);
      setEnrollments(data.enrollments);
      setEnrollmentPagination({
        total: data.total,
        totalPages: data.totalPages,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnrollmentsLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const params = {};
      if (enrollmentFilter.courseId) params.courseId = enrollmentFilter.courseId;
      if (enrollmentFilter.status) params.status = enrollmentFilter.status;

      const blob = await adminAPI.exportEnrollments(params);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'enrollments.csv');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('导出失败：' + err.message);
    }
  };

  const loadWaitlists = async () => {
    try {
      setWaitlistsLoading(true);
      const params = {};
      if (waitlistFilter.courseId) params.courseId = waitlistFilter.courseId;
      params.page = waitlistFilter.page;
      params.limit = waitlistFilter.limit;

      const data = await adminAPI.getWaitlists(params);
      setWaitlists(data.waitlists);
      setWaitlistPagination({
        total: data.total,
        totalPages: data.totalPages,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setWaitlistsLoading(false);
    }
  };

  const handleExportWaitlistsCSV = async () => {
    try {
      const params = {};
      if (waitlistFilter.courseId) params.courseId = waitlistFilter.courseId;

      const blob = await adminAPI.exportWaitlists(params);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'waitlists.csv');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('导出失败：' + err.message);
    }
  };

  const handleApproveRefund = async (enrollmentId) => {
    if (!window.confirm('确定要通过该退课申请吗？通过后名额将释放给候补用户。')) {
      return;
    }
    try {
      setError('');
      await adminAPI.approveRefund(enrollmentId);
      loadEnrollments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpenRejectModal = (enrollmentId) => {
    setRejectingEnrollmentId(enrollmentId);
    setRejectReason('');
    setRejectModal(true);
  };

  const handleRejectRefund = async () => {
    if (!rejectingEnrollmentId) return;
    
    try {
      setError('');
      await adminAPI.rejectRefund(rejectingEnrollmentId, rejectReason);
      setRejectModal(false);
      setRejectingEnrollmentId(null);
      loadEnrollments();
    } catch (err) {
      setError(err.message);
    }
  };

  const getStatusBadge = (status, refundStatus) => {
    const stylesMap = {
      pending: { bg: '#fef3c7', color: '#92400e', text: '待支付' },
      paid: { bg: '#dcfce7', color: '#166534', text: '已支付' },
      cancelled: { bg: '#fee2e2', color: '#991b1b', text: '已取消' },
      refund_pending: { bg: '#fef3c7', color: '#92400e', text: '退课审核中' },
      refund_approved: { bg: '#fee2e2', color: '#991b1b', text: '已退课' },
      refund_rejected: { bg: '#dcfce7', color: '#166534', text: '已支付' },
    };
    
    let displayStatus = status;
    if (refundStatus === 'pending') {
      displayStatus = 'refund_pending';
    } else if (refundStatus === 'approved') {
      displayStatus = 'refund_approved';
    } else if (refundStatus === 'rejected') {
      displayStatus = 'refund_rejected';
    }
    
    const style = stylesMap[displayStatus] || stylesMap.pending;
    return (
      <span style={{
        backgroundColor: style.bg,
        color: style.color,
        padding: '0.25rem 0.75rem',
        borderRadius: '20px',
        fontSize: '0.8rem',
        fontWeight: '500',
      }}>
        {style.text}
      </span>
    );
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
    if (!window.confirm('确定要关闭该课程的报名吗？关闭后将无法新增报名和候补。')) {
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
        <h1 style={styles.title}>管理后台</h1>
      </div>

      <div style={styles.tabs}>
        <button 
          onClick={() => setActiveTab('courses')}
          style={{
            ...styles.tab,
            ...(activeTab === 'courses' ? styles.tabActive : {}),
          }}
        >
          课程管理
        </button>
        <button 
          onClick={() => setActiveTab('enrollments')}
          style={{
            ...styles.tab,
            ...(activeTab === 'enrollments' ? styles.tabActive : {}),
          }}
        >
          报名明细
        </button>
        <button 
          onClick={() => setActiveTab('waitlists')}
          style={{
            ...styles.tab,
            ...(activeTab === 'waitlists' ? styles.tabActive : {}),
          }}
        >
          候补记录
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {activeTab === 'courses' && (
        <>
          <div style={styles.subHeader}>
            <h2 style={styles.subTitle}>课程列表</h2>
            <button onClick={handleCreate} style={styles.createBtn}>
              + 新建课程
            </button>
          </div>

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
        </>
      )}

      {activeTab === 'enrollments' && (
        <>
          <div style={styles.subHeader}>
            <h2 style={styles.subTitle}>报名明细</h2>
            <button onClick={handleExportCSV} style={styles.exportBtn}>
              📥 导出CSV
            </button>
          </div>

          <div style={styles.filterBar}>
            <div style={styles.filterItem}>
              <label style={styles.filterLabel}>筛选课程</label>
              <select
                value={enrollmentFilter.courseId}
                onChange={(e) => setEnrollmentFilter({ ...enrollmentFilter, courseId: e.target.value, page: 1 })}
                style={styles.filterSelect}
              >
                <option value="">全部课程</option>
                {courses.map(course => (
                  <option key={course.id} value={course.id}>
                    {course.title} {course.isActive ? '' : '(已关闭)'}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.filterItem}>
              <label style={styles.filterLabel}>筛选状态</label>
              <select
                value={enrollmentFilter.status}
                onChange={(e) => setEnrollmentFilter({ ...enrollmentFilter, status: e.target.value, page: 1 })}
                style={styles.filterSelect}
              >
                <option value="">全部状态</option>
                <option value="pending">待支付</option>
                <option value="paid">已支付</option>
                <option value="cancelled">已取消</option>
                <option value="refund_pending">退课审核中</option>
              </select>
            </div>
          </div>

          <div style={styles.tableContainer}>
            {enrollmentsLoading ? (
              <div style={styles.loading}>加载中...</div>
            ) : (
              <>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.th}>用户名</th>
                      <th style={styles.th}>课程名称</th>
                      <th style={styles.th}>状态</th>
                      <th style={styles.th}>报名时间</th>
                      <th style={styles.th}>支付时间</th>
                      <th style={styles.th}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map(enrollment => (
                      <tr key={enrollment.id} style={styles.tableRow}>
                        <td style={styles.td}>
                          <span style={styles.userName}>{enrollment.user.username}</span>
                        </td>
                        <td style={styles.td}>{enrollment.course.title}</td>
                        <td style={styles.td}>{getStatusBadge(enrollment.status, enrollment.refundStatus)}</td>
                        <td style={styles.td}>{formatDate(enrollment.createdAt)}</td>
                        <td style={styles.td}>
                          {enrollment.paidAt ? formatDate(enrollment.paidAt) : '-'}
                        </td>
                        <td style={styles.td}>
                          {enrollment.refundStatus === 'pending' && (
                            <div style={styles.actions}>
                              <button
                                onClick={() => handleApproveRefund(enrollment.id)}
                                style={{ ...styles.actionBtn, color: '#16a34a' }}
                              >
                                通过
                              </button>
                              <button
                                onClick={() => handleOpenRejectModal(enrollment.id)}
                                style={{ ...styles.actionBtn, color: '#dc2626' }}
                              >
                                驳回
                              </button>
                            </div>
                          )}
                          {enrollment.refundStatus === 'approved' && (
                            <span style={{ color: '#16a34a', fontSize: '0.85rem' }}>已通过</span>
                          )}
                          {enrollment.refundStatus === 'rejected' && (
                            <span style={{ color: '#dc2626', fontSize: '0.85rem' }}>已驳回</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {enrollments.length === 0 && (
                  <div style={styles.empty}>暂无报名记录</div>
                )}

                {enrollmentPagination.totalPages > 1 && (
                  <div style={styles.pagination}>
                    <button
                      onClick={() => setEnrollmentFilter({ ...enrollmentFilter, page: enrollmentFilter.page - 1 })}
                      disabled={enrollmentFilter.page <= 1}
                      style={styles.pageBtn}
                    >
                      上一页
                    </button>
                    <span style={styles.pageInfo}>
                      第 {enrollmentFilter.page} 页 / 共 {enrollmentPagination.totalPages} 页
                      （{enrollmentPagination.total} 条记录）
                    </span>
                    <button
                      onClick={() => setEnrollmentFilter({ ...enrollmentFilter, page: enrollmentFilter.page + 1 })}
                      disabled={enrollmentFilter.page >= enrollmentPagination.totalPages}
                      style={styles.pageBtn}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {activeTab === 'waitlists' && (
        <>
          <div style={styles.subHeader}>
            <h2 style={styles.subTitle}>候补记录</h2>
            <button onClick={handleExportWaitlistsCSV} style={styles.exportBtn}>
              📥 导出CSV
            </button>
          </div>

          <div style={styles.filterBar}>
            <div style={styles.filterItem}>
              <label style={styles.filterLabel}>筛选课程</label>
              <select
                value={waitlistFilter.courseId}
                onChange={(e) => setWaitlistFilter({ ...waitlistFilter, courseId: e.target.value, page: 1 })}
                style={styles.filterSelect}
              >
                <option value="">全部课程</option>
                {courses.map(course => (
                  <option key={course.id} value={course.id}>
                    {course.title} {course.isActive ? '' : '(已关闭)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.tableContainer}>
            {waitlistsLoading ? (
              <div style={styles.loading}>加载中...</div>
            ) : (
              <>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.th}>用户名</th>
                      <th style={styles.th}>课程名称</th>
                      <th style={styles.th}>排队顺位</th>
                      <th style={styles.th}>加入时间</th>
                      <th style={styles.th}>课程状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitlists.map(waitlist => (
                      <tr key={waitlist.id} style={styles.tableRow}>
                        <td style={styles.td}>
                          <span style={styles.userName}>{waitlist.user.username}</span>
                        </td>
                        <td style={styles.td}>{waitlist.course.title}</td>
                        <td style={styles.td}>
                          <span style={{ fontWeight: 'bold', color: '#3730a3' }}>
                            第 {waitlist.position} 位
                          </span>
                        </td>
                        <td style={styles.td}>{formatDate(waitlist.createdAt)}</td>
                        <td style={styles.td}>
                          {waitlist.course.isActive ? (
                            <span style={styles.statusActive}>招生中</span>
                          ) : (
                            <span style={styles.statusClosed}>已关闭</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {waitlists.length === 0 && (
                  <div style={styles.empty}>暂无候补记录</div>
                )}

                {waitlistPagination.totalPages > 1 && (
                  <div style={styles.pagination}>
                    <button
                      onClick={() => setWaitlistFilter({ ...waitlistFilter, page: waitlistFilter.page - 1 })}
                      disabled={waitlistFilter.page <= 1}
                      style={styles.pageBtn}
                    >
                      上一页
                    </button>
                    <span style={styles.pageInfo}>
                      第 {waitlistFilter.page} 页 / 共 {waitlistPagination.totalPages} 页
                      （{waitlistPagination.total} 条记录）
                    </span>
                    <button
                      onClick={() => setWaitlistFilter({ ...waitlistFilter, page: waitlistFilter.page + 1 })}
                      disabled={waitlistFilter.page >= waitlistPagination.totalPages}
                      style={styles.pageBtn}
                    >
                      下一页
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {rejectModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>驳回退课申请</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleRejectRefund(); }} style={styles.form}>
              {formError && <div style={styles.modalError}>{formError}</div>}

              <div style={styles.field}>
                <label style={styles.label}>驳回原因（可选）</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  style={styles.textarea}
                  rows={4}
                  placeholder="请输入驳回原因..."
                />
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setRejectModal(false)}
                  style={styles.cancelBtn}
                >
                  取消
                </button>
                <button type="submit" style={{ ...styles.submitBtn, backgroundColor: '#dc2626' }}>
                  确认驳回
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: 0,
  },
  tabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    borderBottom: '1px solid #e2e8f0',
  },
  tab: {
    padding: '0.75rem 1.5rem',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    color: '#64748b',
    borderBottom: '2px solid transparent',
    marginBottom: '-1px',
    fontWeight: '500',
  },
  tabActive: {
    color: '#2563eb',
    borderBottomColor: '#2563eb',
  },
  subHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  subTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
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
  exportBtn: {
    backgroundColor: '#16a34a',
    color: 'white',
    border: 'none',
    padding: '0.625rem 1.25rem',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  filterBar: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1rem',
    flexWrap: 'wrap',
  },
  filterItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  filterLabel: {
    fontSize: '0.85rem',
    color: '#64748b',
    fontWeight: '500',
  },
  filterSelect: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '0.95rem',
    outline: 'none',
    backgroundColor: 'white',
    minWidth: '200px',
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
  userName: {
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
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '1rem',
    padding: '1.5rem',
    borderTop: '1px solid #e2e8f0',
  },
  pageBtn: {
    padding: '0.5rem 1rem',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#475569',
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  pageInfo: {
    fontSize: '0.9rem',
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
