import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { enrollmentAPI } from '../services/api';
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

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      return { days, hours, minutes, seconds, expired: false };
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return timeLeft;
}

function CountdownTimer({ targetDate, type = 'reservation' }) {
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
      <span style={styles.timerText}>
        {timeLeft.minutes}分 {timeLeft.seconds}秒
      </span>
    );
  }

  return (
    <span style={styles.timerText}>
      {timeLeft.days}天 {timeLeft.hours}时 {timeLeft.minutes}分
    </span>
  );
}

function MyCourses() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  
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

  const handlePay = async (enrollmentId) => {
    try {
      await enrollmentAPI.pay(enrollmentId);
      loadEnrollments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = async (enrollmentId) => {
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

  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: '#fef3c7', color: '#92400e', text: '待支付' },
      paid: { bg: '#dcfce7', color: '#166534', text: '已支付' },
      cancelled: { bg: '#fee2e2', color: '#991b1b', text: '已取消' },
    };
    const style = styles[status] || styles.pending;
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

  const filteredEnrollments = enrollments.filter(e => {
    if (activeTab === 'all') return true;
    return e.status === activeTab;
  });

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
      </div>

      {filteredEnrollments.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>暂无课程记录</p>
          <Link to="/" style={styles.browseBtn}>浏览课程</Link>
        </div>
      ) : (
        <div style={styles.list}>
          {filteredEnrollments.map(enrollment => (
            <div key={enrollment.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <Link 
                  to={`/courses/${enrollment.course.id}`}
                  style={styles.courseTitle}
                >
                  {enrollment.course.title}
                </Link>
                {getStatusBadge(enrollment.status)}
              </div>

              <div style={styles.cardBody}>
                <div style={styles.infoGrid}>
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>开课时间</span>
                    <span style={styles.infoValue}>
                      {formatDate(enrollment.course.startDate)}
                    </span>
                  </div>

                  {enrollment.status === 'pending' && enrollment.reservedUntil && (
                    <div style={styles.infoItem}>
                      <span style={styles.infoLabel}>支付剩余时间</span>
                      <CountdownTimer targetDate={enrollment.reservedUntil} type="reservation" />
                    </div>
                  )}

                  {enrollment.status === 'paid' && (
                    <div style={styles.infoItem}>
                      <span style={styles.infoLabel}>距离开课</span>
                      <CountdownTimer targetDate={enrollment.course.startDate} type="course" />
                    </div>
                  )}

                  {enrollment.paidAt && (
                    <div style={styles.infoItem}>
                      <span style={styles.infoLabel}>支付时间</span>
                      <span style={styles.infoValue}>
                        {formatDate(enrollment.paidAt)}
                      </span>
                    </div>
                  )}

                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>报名时间</span>
                    <span style={styles.infoValue}>
                      {formatDate(enrollment.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div style={styles.cardFooter}>
                {enrollment.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handlePay(enrollment.id)}
                      style={styles.payBtn}
                    >
                      立即支付
                    </button>
                    <button
                      onClick={() => handleCancel(enrollment.id)}
                      style={styles.cancelBtn}
                    >
                      取消报名
                    </button>
                  </>
                )}
                {enrollment.status === 'paid' && (
                  <span style={styles.completedTag}>
                    ✓ 报名成功，请等待开课
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
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
};

export default MyCourses;
