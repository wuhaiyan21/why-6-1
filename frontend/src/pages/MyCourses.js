import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { enrollmentAPI, notificationAPI } from '../services/api';
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

function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!targetDate) return;

    const calculateTimeLeft = () => {
      const difference = new Date(targetDate) - new Date();
      
      if (difference <= 0) {
        return { expired: true };
      }

      const totalSeconds = Math.floor(difference / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      return { totalSeconds, minutes, seconds, expired: false };
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return timeLeft;
}

function CountdownTimer({ targetDate, type = 'reservation', isUrgent = false }) {
  const timeLeft = useCountdown(targetDate);

  if (!timeLeft) return null;

  if (timeLeft.expired) {
    return (
      <span style={{ color: '#dc2626', fontWeight: '500' }}>
        已过期
      </span>
    );
  }

  if (type === 'reservation') {
    return (
      <span style={{
        ...styles.timerText,
        ...(isUrgent ? styles.urgentTimer : {})
      }}>
        {timeLeft.minutes}分 {timeLeft.seconds}秒
      </span>
    );
  }

  const days = Math.floor(timeLeft.totalSeconds / (60 * 60 * 24));
  const hours = Math.floor((timeLeft.totalSeconds % (60 * 60 * 24)) / (60 * 60));
  const minutes = Math.floor((timeLeft.totalSeconds % (60 * 60)) / 60);

  return (
    <span style={styles.timerText}>
      {days}天 {hours}时 {minutes}分
    </span>
  );
}

function NotificationToast({ notification, onClose, onMarkRead }) {
  if (!notification) return null;

  const handleClose = () => {
    if (onMarkRead) {
      onMarkRead(notification.id);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div style={styles.toastContainer}>
      <div style={styles.toast}>
        <div style={styles.toastHeader}>
          <span style={styles.toastTitle}>🔔 {notification.title}</span>
          <button onClick={handleClose} style={styles.toastClose}>×</button>
        </div>
        <div style={styles.toastBody}>
          <p style={styles.toastContent}>{notification.content}</p>
        </div>
        <div style={styles.toastFooter}>
          <button onClick={handleClose} style={styles.toastBtn}>
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}

function MyCourses() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [cancelledNotification, setCancelledNotification] = useState(null);
  const [shownNotificationIds, setShownNotificationIds] = useState(new Set());
  
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const loadEnrollments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await enrollmentAPI.getMyEnrollments();
      setEnrollments(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadEnrollments();
    }
  }, [isAuthenticated, loadEnrollments]);

  const checkNotifications = useCallback(async () => {
    try {
      const notifications = await notificationAPI.getNotifications(true);
      
      const unreadExpired = notifications.find(
        n => n.type === 'enrollment_expired' && !n.isRead
      );
      
      const unreadPromoted = notifications.find(
        n => n.type === 'waitlist_promoted' && !n.isRead
      );

      const unreadTimeChange = notifications.find(
        n => n.type === 'course_time_change' && !n.isRead
      );

      const targetNotification = unreadExpired || unreadPromoted || unreadTimeChange;

      if (targetNotification && !shownNotificationIds.has(targetNotification.id)) {
        setCancelledNotification(targetNotification);
        setShownNotificationIds(prev => new Set([...prev, targetNotification.id]));
        loadEnrollments();
      }
    } catch (err) {
      console.error('Failed to check notifications:', err);
    }
  }, [shownNotificationIds, loadEnrollments]);

  useEffect(() => {
    if (isAuthenticated) {
      checkNotifications();
      const interval = setInterval(checkNotifications, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, checkNotifications]);

  const handlePay = async (enrollmentId) => {
    try {
      await enrollmentAPI.pay(enrollmentId);
      loadEnrollments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = async (enrollmentId, courseId) => {
    if (!window.confirm('确定要取消报名吗？')) {
      return;
    }
    try {
      await enrollmentAPI.cancel(enrollmentId);
      loadEnrollments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancelWaitlist = async (courseId) => {
    if (!window.confirm('确定要取消候补吗？')) {
      return;
    }
    try {
      await enrollmentAPI.cancelWaitlist(courseId);
      loadEnrollments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRequestRefund = async (enrollmentId) => {
    const reason = window.prompt('请输入退课原因（可选）：');
    if (reason === null) return;
    
    if (!window.confirm('确定要申请退课吗？退课后名额将释放给其他候补用户。')) {
      return;
    }
    try {
      await enrollmentAPI.requestRefund(enrollmentId, reason || '');
      loadEnrollments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleExtendPayment = async (enrollmentId) => {
    if (!window.confirm('确定要延长5分钟支付时间吗？每门课程只能延长一次。')) {
      return;
    }
    try {
      await enrollmentAPI.extendPayment(enrollmentId);
      loadEnrollments();
    } catch (err) {
      setError(err.message);
    }
  };

  const canExtend = (item) => {
    if (item.type !== 'enrollment' || item.status !== 'pending') return false;
    if (item.hasExtended) return false;
    if (!item.reservedUntil) return false;
    
    const now = new Date();
    const reservedUntil = new Date(item.reservedUntil);
    if (reservedUntil <= now) return false;
    
    const remainingSeconds = (reservedUntil - now) / 1000;
    return remainingSeconds <= 300;
  };

  const getStatusBadge = (status, type, refundStatus) => {
    const stylesMap = {
      pending: { bg: '#fef3c7', color: '#92400e', text: '待支付' },
      paid: { bg: '#dcfce7', color: '#166534', text: '已支付' },
      cancelled: { bg: '#fee2e2', color: '#991b1b', text: '已取消' },
      waiting: { bg: '#e0e7ff', color: '#3730a3', text: '候补中' },
      refund_pending: { bg: '#fef3c7', color: '#92400e', text: '退课审核中' },
      refund_approved: { bg: '#fee2e2', color: '#991b1b', text: '已退课' },
      refund_rejected: { bg: '#dcfce7', color: '#166534', text: '已支付' },
    };
    
    let displayStatus = type === 'waitlist' ? 'waiting' : status;
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

  const isUrgent = (reservedUntil) => {
    if (!reservedUntil) return false;
    const diff = new Date(reservedUntil) - new Date();
    return diff > 0 && diff <= 5 * 60 * 1000;
  };

  const filteredEnrollments = enrollments.filter(e => {
    if (activeTab === 'all') return true;
    if (activeTab === 'waiting') return e.type === 'waitlist';
    return e.status === activeTab;
  });

  const markNotificationAsRead = async (notificationId) => {
    try {
      await notificationAPI.markAsRead(notificationId);
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={styles.container}>
        <div style={styles.loginPrompt}>
          <h2>请先登录</h2>
          <p>登录后查看您的课程报名记录</p>
          <button 
            onClick={() => navigate('/login')}
            style={styles.loginBtn}
          >
            去登录
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
      <h1 style={styles.title}>我的课程</h1>
      
      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.tabs}>
        <button 
          onClick={() => setActiveTab('all')}
          style={{
            ...styles.tab,
            ...(activeTab === 'all' ? styles.tabActive : {}),
          }}
        >
          全部 ({enrollments.length})
        </button>
        <button 
          onClick={() => setActiveTab('pending')}
          style={{
            ...styles.tab,
            ...(activeTab === 'pending' ? styles.tabActive : {}),
          }}
        >
          待支付 ({enrollments.filter(e => e.status === 'pending').length})
        </button>
        <button 
          onClick={() => setActiveTab('paid')}
          style={{
            ...styles.tab,
            ...(activeTab === 'paid' ? styles.tabActive : {}),
          }}
        >
          已支付 ({enrollments.filter(e => e.status === 'paid').length})
        </button>
        <button 
          onClick={() => setActiveTab('waiting')}
          style={{
            ...styles.tab,
            ...(activeTab === 'waiting' ? styles.tabActive : {}),
          }}
        >
          候补中 ({enrollments.filter(e => e.type === 'waitlist').length})
        </button>
      </div>

      {filteredEnrollments.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>暂无课程记录</p>
          <Link to="/" style={styles.browseBtn}>浏览课程</Link>
        </div>
      ) : (
        <div style={styles.list}>
          {filteredEnrollments.map(item => {
            const isCardUrgent = item.type === 'enrollment' && 
              item.status === 'pending' && 
              isUrgent(item.reservedUntil);

            return (
              <div 
                key={`${item.type}-${item.id}`} 
                style={{
                  ...styles.card,
                  ...(isCardUrgent ? styles.cardUrgent : {})
                }}
              >
                <div style={styles.cardHeader}>
                  <Link 
                    to={`/courses/${item.course.id}`}
                    style={styles.courseTitle}
                  >
                    {item.course.title}
                  </Link>
                  {getStatusBadge(item.status, item.type, item.refundStatus)}
                </div>

                <div style={styles.cardBody}>
                  <div style={styles.infoGrid}>
                    <div style={styles.infoItem}>
                      <span style={styles.infoLabel}>开课时间</span>
                      <span style={styles.infoValue}>
                        {formatDate(item.course.startDate)}
                      </span>
                    </div>

                    {item.type === 'enrollment' && item.status === 'pending' && item.reservedUntil && (
                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>支付剩余时间</span>
                        <CountdownTimer 
                          targetDate={item.reservedUntil} 
                          type="reservation"
                          isUrgent={isCardUrgent}
                        />
                      </div>
                    )}

                    {item.type === 'enrollment' && item.status === 'paid' && (
                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>距离开课</span>
                        <CountdownTimer targetDate={item.course.startDate} type="course" />
                      </div>
                    )}

                    {item.type === 'waitlist' && (
                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>候补排名</span>
                        <span style={{ ...styles.infoValue, fontWeight: 'bold', color: '#3730a3' }}>
                          第 {item.position} 位
                        </span>
                      </div>
                    )}

                    {item.paidAt && (
                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>支付时间</span>
                        <span style={styles.infoValue}>
                          {formatDate(item.paidAt)}
                        </span>
                      </div>
                    )}

                    <div style={styles.infoItem}>
                      <span style={styles.infoLabel}>报名时间</span>
                      <span style={styles.infoValue}>
                        {formatDate(item.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={styles.cardFooter}>
                  {item.type === 'enrollment' && item.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handlePay(item.id)}
                        style={styles.payBtn}
                      >
                        立即支付
                      </button>
                      {canExtend(item) && (
                        <button
                          onClick={() => handleExtendPayment(item.id)}
                          style={styles.extendBtn}
                        >
                          延长5分钟
                        </button>
                      )}
                      <button
                        onClick={() => handleCancel(item.id, item.course.id)}
                        style={styles.cancelBtn}
                      >
                        取消报名
                      </button>
                    </>
                  )}
                  {item.type === 'enrollment' && item.status === 'paid' && item.refundStatus !== 'approved' && (
                    <>
                      {item.refundStatus === 'pending' ? (
                        <span style={styles.completedTag}>
                          ⏳ 退课审核中，请等待管理员处理
                        </span>
                      ) : item.refundStatus === 'rejected' ? (
                        <span style={styles.completedTag}>
                          ✓ 报名成功，请等待开课
                        </span>
                      ) : (
                        <>
                          <span style={styles.completedTag}>
                            ✓ 报名成功，请等待开课
                          </span>
                          {new Date(item.course.startDate) > new Date() && (
                            <button
                              onClick={() => handleRequestRefund(item.id)}
                              style={styles.refundBtn}
                            >
                              申请退课
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {item.type === 'enrollment' && item.refundStatus === 'approved' && (
                    <span style={styles.completedTag}>
                      ✗ 已退课
                    </span>
                  )}
                  {item.type === 'waitlist' && (
                    <button
                      onClick={() => handleCancelWaitlist(item.course.id)}
                      style={styles.cancelBtn}
                    >
                      取消候补
                    </button>
                  )}
                </div>

                {isCardUrgent && (
                  <div style={styles.urgentBanner}>
                    ⚠️ 支付即将到期，请尽快完成支付！
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cancelledNotification && (
        <NotificationToast
          notification={cancelledNotification}
          onClose={() => {
            setCancelledNotification(null);
            loadEnrollments();
          }}
          onMarkRead={markNotificationAsRead}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '2rem 1rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: '#1e293b',
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
  tabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    borderBottom: '1px solid #e2e8f0',
    flexWrap: 'wrap',
  },
  tab: {
    padding: '0.75rem 1.25rem',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '0.95rem',
    color: '#64748b',
    borderBottom: '2px solid transparent',
    marginBottom: '-1px',
  },
  tabActive: {
    color: '#2563eb',
    borderBottomColor: '#2563eb',
    fontWeight: '500',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0',
    position: 'relative',
  },
  cardUrgent: {
    borderColor: '#f59e0b',
    boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.2)',
  },
  urgentBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '0.5rem 1.5rem',
    fontSize: '0.85rem',
    fontWeight: '500',
    borderRadius: '12px 12px 0 0',
    textAlign: 'center',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  courseTitle: {
    fontSize: '1.15rem',
    fontWeight: '600',
    color: '#1e293b',
    textDecoration: 'none',
  },
  cardBody: {
    marginBottom: '1rem',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  infoLabel: {
    fontSize: '0.8rem',
    color: '#94a3b8',
  },
  infoValue: {
    fontSize: '0.9rem',
    color: '#334155',
  },
  timerText: {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#2563eb',
  },
  urgentTimer: {
    color: '#dc2626',
    animation: 'pulse 1s infinite',
  },
  cardFooter: {
    display: 'flex',
    gap: '0.75rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e2e8f0',
  },
  payBtn: {
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.5rem 1.25rem',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  cancelBtn: {
    backgroundColor: 'white',
    color: '#dc2626',
    border: '1px solid #fecaca',
    padding: '0.5rem 1.25rem',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  extendBtn: {
    backgroundColor: '#f59e0b',
    color: 'white',
    border: 'none',
    padding: '0.5rem 1.25rem',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  refundBtn: {
    backgroundColor: 'white',
    color: '#dc2626',
    border: '1px solid #fecaca',
    padding: '0.5rem 1.25rem',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  completedTag: {
    color: '#16a34a',
    fontSize: '0.9rem',
    fontWeight: '500',
  },
  empty: {
    textAlign: 'center',
    padding: '4rem 2rem',
    backgroundColor: 'white',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
  },
  emptyText: {
    color: '#64748b',
    marginBottom: '1.5rem',
    fontSize: '1rem',
  },
  browseBtn: {
    display: 'inline-block',
    backgroundColor: '#2563eb',
    color: 'white',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: '500',
  },
  loginPrompt: {
    textAlign: 'center',
    padding: '4rem 2rem',
    backgroundColor: 'white',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
  },
  loginBtn: {
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.75rem 2rem',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '500',
    cursor: 'pointer',
    marginTop: '1rem',
  },
  toastContainer: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 10000,
  },
  toast: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
    border: '1px solid #e2e8f0',
    width: '360px',
    overflow: 'hidden',
  },
  toastHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.25rem',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  toastTitle: {
    fontWeight: '600',
    color: '#1e293b',
    fontSize: '1rem',
  },
  toastClose: {
    background: 'none',
    border: 'none',
    fontSize: '1.5rem',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: 0,
    lineHeight: 1,
  },
  toastBody: {
    padding: '1rem 1.25rem',
  },
  toastContent: {
    color: '#475569',
    fontSize: '0.9rem',
    lineHeight: 1.6,
    margin: 0,
    whiteSpace: 'pre-line',
  },
  toastFooter: {
    padding: '0.75rem 1.25rem',
    display: 'flex',
    justifyContent: 'flex-end',
    backgroundColor: '#f8fafc',
    borderTop: '1px solid #e2e8f0',
  },
  toastBtn: {
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.5rem 1.25rem',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
};

export default MyCourses;
