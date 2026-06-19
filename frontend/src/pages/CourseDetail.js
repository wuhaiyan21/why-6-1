import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { courseAPI, enrollmentAPI, notificationAPI } from '../services/api';
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

function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [waitlisting, setWaitlisting] = useState(false);
  const [prereqCheck, setPrereqCheck] = useState(null);
  const [message, setMessage] = useState('');
  const [waitlistStatus, setWaitlistStatus] = useState(null);
  const [waitlistCount, setWaitlistCount] = useState(null);

  const loadWaitlistStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await enrollmentAPI.getWaitlistStatus(id);
      setWaitlistStatus(data);
    } catch (err) {
      console.error('Failed to get waitlist status:', err);
    }
  }, [id, isAuthenticated]);

  const loadWaitlistCount = useCallback(async () => {
    try {
      const data = await enrollmentAPI.getWaitlistCount(id);
      setWaitlistCount(data);
    } catch (err) {
      console.error('Failed to get waitlist count:', err);
    }
  }, [id]);

  const checkPrerequisites = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await enrollmentAPI.checkPrerequisites(id);
      setPrereqCheck(data);
    } catch (err) {
      console.error('Failed to check prerequisites:', err);
    }
  }, [id, isAuthenticated]);

  useEffect(() => {
    loadCourse();
  }, [id, loadCourse]);

  useEffect(() => {
    if (isAuthenticated && course) {
      checkPrerequisites();
      loadWaitlistStatus();
    }
    if (course) {
      loadWaitlistCount();
    }
  }, [isAuthenticated, course, checkPrerequisites, loadWaitlistStatus, loadWaitlistCount]);

  const loadCourse = async () => {
    try {
      setLoading(true);
      const data = await courseAPI.getCourse(id);
      setCourse(data);
      
      if (isAuthenticated) {
        try {
          await notificationAPI.markCourseAsRead(id);
        } catch (err) {
          console.error('Failed to mark course notifications as read:', err);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinWaitlist = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/courses/${id}` } });
      return;
    }

    try {
      setWaitlisting(true);
      setError('');
      await enrollmentAPI.joinWaitlist(id);
      setMessage('成功加入候补队列！');
      loadWaitlistStatus();
      loadWaitlistCount();
    } catch (err) {
      setError(err.message);
    } finally {
      setWaitlisting(false);
    }
  };

  const handleCancelWaitlist = async () => {
    if (!window.confirm('确定要取消候补吗？')) {
      return;
    }
    try {
      setWaitlisting(true);
      setError('');
      await enrollmentAPI.cancelWaitlist(id);
      setMessage('已取消候补');
      loadWaitlistStatus();
      loadWaitlistCount();
    } catch (err) {
      setError(err.message);
    } finally {
      setWaitlisting(false);
    }
  };

  const handleEnroll = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/courses/${id}` } });
      return;
    }

    try {
      setEnrolling(true);
      setError('');
      await enrollmentAPI.enroll(id);
      setMessage('报名成功！请在15分钟内完成支付。');
      setTimeout(() => {
        navigate('/my-courses');
      }, 1500);
    } catch (err) {
      if (err.message === 'Prerequisites not met') {
        setError('缺少前置学习记录，无法报名');
        checkPrerequisites();
      } else {
        setError(err.message);
      }
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return <div style={styles.loading}>加载中...</div>;
  }

  if (error && !course) {
    return <div style={styles.error}>错误: {error}</div>;
  }

  return (
    <div style={styles.container}>
      <button onClick={() => navigate(-1)} style={styles.backBtn}>
        ← 返回列表
      </button>

      <div style={styles.header}>
        <h1 style={styles.title}>{course.title}</h1>
        <div style={styles.statusBadge}>
          {course.remainingSlots > 0 ? (
            <span style={styles.available}>剩余 {course.remainingSlots} 个名额</span>
          ) : (
            <span style={styles.full}>已满员</span>
          )}
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.mainInfo}>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>课程简介</h2>
            <p style={styles.description}>{course.description}</p>
          </div>

          {course.prerequisites && course.prerequisites.length > 0 && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>前置课程</h2>
              <ul style={styles.prereqList}>
                {course.prerequisites.map(prereq => (
                  <li key={prereq.id} style={styles.prereqItem}>
                    <span style={styles.prereqName}>{prereq.title}</span>
                    {prereqCheck && (
                      prereqCheck.missing.some(p => p.id === prereq.id) ? (
                        <span style={styles.prereqNotMet}>未完成</span>
                      ) : (
                        <span style={styles.prereqMet}>已完成</span>
                      )
                    )}
                  </li>
                ))}
              </ul>
              {prereqCheck && !prereqCheck.met && (
                <p style={styles.prereqWarning}>
                  ⚠️ 您需要先完成以上所有前置课程才能报名本课程
                </p>
              )}
            </div>
          )}
        </div>

        <div style={styles.sidebar}>
          <div style={styles.infoCard}>
            <h3 style={styles.infoCardTitle}>课程信息</h3>
            
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>开课时间</span>
              <span style={styles.infoValue}>{formatDate(course.startDate)}</span>
            </div>

            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>总名额</span>
              <span style={styles.infoValue}>{course.capacity} 人</span>
            </div>

            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>已报名</span>
              <span style={styles.infoValue}>{course.enrolledCount} 人</span>
            </div>

            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>剩余名额</span>
              <span style={{
                ...styles.infoValue,
                color: course.remainingSlots > 0 ? '#16a34a' : '#dc2626',
                fontWeight: 'bold',
              }}>
                {course.remainingSlots} 人
              </span>
            </div>

            {message && (
              <div style={styles.successMessage}>{message}</div>
            )}

            {error && (
              <div style={styles.errorMessage}>{error}</div>
            )}

            {course.remainingSlots > 0 ? (
              <button
                onClick={handleEnroll}
                disabled={enrolling || (prereqCheck && !prereqCheck.met)}
                style={{
                  ...styles.enrollBtn,
                  opacity: (enrolling || (prereqCheck && !prereqCheck.met)) ? 0.5 : 1,
                  cursor: (enrolling || (prereqCheck && !prereqCheck.met)) ? 'not-allowed' : 'pointer',
                }}
              >
                {enrolling ? '报名中...' : '立即报名'}
              </button>
            ) : (
              <>
                {waitlistCount && waitlistCount.totalCount > 0 && (
                  <div style={styles.waitlistCountInfo}>
                    <span style={styles.waitlistCountText}>
                      📋 当前候补人数：<strong>{waitlistCount.displayCount}</strong> 人
                    </span>
                  </div>
                )}
                
                {waitlistStatus && waitlistStatus.onWaitlist ? (
                  <>
                    <div style={styles.waitlistInfo}>
                      <p style={styles.waitlistText}>
                        📋 您已加入候补队列
                      </p>
                      <p style={styles.waitlistPosition}>
                        您的排名：第 <strong>{waitlistStatus.position}</strong> 位
                        {waitlistCount && waitlistCount.totalCount > 0 && (
                          <span style={styles.waitlistCountDetail}>
                            （共 {waitlistCount.totalCount} 人候补中）
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={handleCancelWaitlist}
                      disabled={waitlisting}
                      style={{
                        ...styles.waitlistCancelBtn,
                        opacity: waitlisting ? 0.5 : 1,
                        cursor: waitlisting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {waitlisting ? '处理中...' : '取消候补'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleJoinWaitlist}
                    disabled={waitlisting || (prereqCheck && !prereqCheck.met)}
                    style={{
                      ...styles.waitlistBtn,
                      opacity: (waitlisting || (prereqCheck && !prereqCheck.met)) ? 0.5 : 1,
                      cursor: (waitlisting || (prereqCheck && !prereqCheck.met)) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {waitlisting ? '加入中...' : '加入候补'}
                    {waitlistCount && waitlistCount.totalCount > 0 && (
                      <span style={styles.waitlistBtnCount}>
                        （{waitlistCount.displayCount}人候补中）
                      </span>
                    )}
                  </button>
                )}
              </>
            )}

            {!isAuthenticated && (
              <p style={styles.loginHint}>请先登录后再报名</p>
            )}

            {course.remainingSlots > 0 && (
              <p style={styles.note}>
                💡 报名后系统会为您保留15分钟名额，请尽快完成支付
              </p>
            )}
            {course.remainingSlots <= 0 && (
              <p style={styles.note}>
                💡 加入候补后，如有名额释放将按顺序自动转为待支付，保留15分钟
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem 1rem',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    fontSize: '1rem',
    cursor: 'pointer',
    marginBottom: '1rem',
    padding: '0.5rem 0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '2rem',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: 0,
  },
  statusBadge: {},
  available: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '0.5rem 1rem',
    borderRadius: '20px',
    fontSize: '0.9rem',
    fontWeight: '500',
  },
  full: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '0.5rem 1rem',
    borderRadius: '20px',
    fontSize: '0.9rem',
    fontWeight: '500',
  },
  content: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '2rem',
  },
  mainInfo: {},
  section: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0',
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '1rem',
  },
  description: {
    color: '#475569',
    lineHeight: 1.8,
    fontSize: '1rem',
  },
  prereqList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  prereqItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    marginBottom: '0.5rem',
  },
  prereqName: {
    fontWeight: '500',
    color: '#334155',
  },
  prereqMet: {
    color: '#16a34a',
    fontSize: '0.85rem',
    fontWeight: '500',
  },
  prereqNotMet: {
    color: '#dc2626',
    fontSize: '0.85rem',
    fontWeight: '500',
  },
  prereqWarning: {
    color: '#d97706',
    fontSize: '0.9rem',
    marginTop: '1rem',
    padding: '0.75rem',
    backgroundColor: '#fef3c7',
    borderRadius: '8px',
  },
  sidebar: {},
  infoCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0',
    position: 'sticky',
    top: '1rem',
  },
  infoCardTitle: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '1rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #e2e8f0',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
  },
  infoLabel: {
    color: '#64748b',
    fontSize: '0.95rem',
  },
  infoValue: {
    color: '#334155',
    fontWeight: '500',
  },
  enrollBtn: {
    width: '100%',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.875rem',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '1rem',
  },
  waitlistBtn: {
    width: '100%',
    backgroundColor: '#f59e0b',
    color: 'white',
    border: 'none',
    padding: '0.875rem',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '1rem',
  },
  waitlistCancelBtn: {
    width: '100%',
    backgroundColor: 'white',
    color: '#dc2626',
    border: '1px solid #fecaca',
    padding: '0.75rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: '500',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  waitlistCountInfo: {
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    marginTop: '1rem',
    marginBottom: '0.5rem',
    textAlign: 'center',
  },
  waitlistCountText: {
    color: '#92400e',
    fontSize: '0.9rem',
    fontWeight: '500',
  },
  waitlistCountDetail: {
    color: '#78350f',
    fontSize: '0.8rem',
    marginLeft: '0.25rem',
    fontWeight: 'normal',
  },
  waitlistBtnCount: {
    fontSize: '0.85rem',
    fontWeight: 'normal',
    marginLeft: '0.25rem',
  },
  waitlistInfo: {
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    padding: '1rem',
    marginTop: '1rem',
    textAlign: 'center',
  },
  waitlistText: {
    color: '#92400e',
    fontWeight: '600',
    margin: '0 0 0.5rem 0',
    fontSize: '0.95rem',
  },
  waitlistPosition: {
    color: '#78350f',
    margin: 0,
    fontSize: '0.9rem',
  },
  loginHint: {
    textAlign: 'center',
    fontSize: '0.85rem',
    color: '#64748b',
    marginTop: '0.5rem',
  },
  note: {
    fontSize: '0.8rem',
    color: '#64748b',
    marginTop: '0.75rem',
    lineHeight: 1.5,
  },
  successMessage: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  errorMessage: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  loading: {
    textAlign: 'center',
    padding: '3rem',
    fontSize: '1.1rem',
    color: '#64748b',
  },
  error: {
    textAlign: 'center',
    padding: '3rem',
    color: '#dc2626',
    fontSize: '1.1rem',
  },
};

export default CourseDetail;
