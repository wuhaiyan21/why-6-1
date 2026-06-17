import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { notificationAPI } from '../services/api';

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Navbar() {
  const { user, logout, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const data = await notificationAPI.getUnreadCount();
      setUnreadCount(data.unreadCount);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  };

  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const data = await notificationAPI.getNotifications();
      setNotifications(data);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleNotificationClick = async () => {
    if (!showNotifications) {
      setShowNotifications(true);
      fetchNotifications();
    } else {
      setShowNotifications(false);
    }
  };

  const handleMarkAsRead = async (notificationId, event) => {
    event.stopPropagation();
    try {
      await notificationAPI.markAsRead(notificationId);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const handleMarkAllAsRead = async (event) => {
    event.stopPropagation();
    try {
      await notificationAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav style={styles.nav}>
      <div style={styles.container}>
        <Link to="/" style={styles.logo}>
          📚 在线课程平台
        </Link>
        
        <div style={styles.links}>
          <Link to="/" style={styles.link}>课程列表</Link>
          
          {isAuthenticated ? (
            <>
              <Link to="/my-courses" style={styles.link}>我的课程</Link>
              {isAdmin && <Link to="/admin" style={styles.link}>管理后台</Link>}
              
              <div style={styles.notificationContainer} ref={dropdownRef}>
                <button 
                  onClick={handleNotificationClick}
                  style={styles.notificationBtn}
                >
                  🔔
                  {unreadCount > 0 && (
                    <span style={styles.notificationBadge}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div style={styles.notificationDropdown}>
                    <div style={styles.dropdownHeader}>
                      <span style={styles.dropdownTitle}>通知</span>
                      {unreadCount > 0 && (
                        <button 
                          onClick={handleMarkAllAsRead}
                          style={styles.markAllBtn}
                        >
                          全部已读
                        </button>
                      )}
                    </div>
                    
                    <div style={styles.dropdownList}>
                      {loadingNotifications ? (
                        <div style={styles.dropdownLoading}>加载中...</div>
                      ) : notifications.length === 0 ? (
                        <div style={styles.dropdownEmpty}>暂无通知</div>
                      ) : (
                        notifications.map(notification => (
                          <div 
                            key={notification.id}
                            style={{
                              ...styles.notificationItem,
                              ...(notification.isRead ? styles.notificationRead : {})
                            }}
                            onClick={(e) => handleMarkAsRead(notification.id, e)}
                          >
                            <div style={styles.notificationItemHeader}>
                              <span style={styles.notificationItemTitle}>
                                {notification.title}
                              </span>
                              {!notification.isRead && (
                                <span style={styles.unreadDot}></span>
                              )}
                            </div>
                            <p style={styles.notificationItemContent}>
                              {notification.content}
                            </p>
                            <span style={styles.notificationItemTime}>
                              {formatDate(notification.createdAt)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <span style={styles.username}>{user?.username}</span>
              <button onClick={handleLogout} style={styles.logoutBtn}>
                退出登录
              </button>
            </>
          ) : (
            <>
              <Link to="/login" style={styles.link}>登录</Link>
              <Link to="/register" style={styles.registerBtn}>注册</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    backgroundColor: '#2563eb',
    color: 'white',
    padding: '1rem 0',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    position: 'relative',
    zIndex: 100,
  },
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    color: 'white',
    textDecoration: 'none',
    fontSize: '1.25rem',
    fontWeight: 'bold',
  },
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
  },
  link: {
    color: 'white',
    textDecoration: 'none',
    fontSize: '0.95rem',
  },
  notificationContainer: {
    position: 'relative',
  },
  notificationBtn: {
    background: 'none',
    border: 'none',
    color: 'white',
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '0.25rem',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: '0.7rem',
    fontWeight: 'bold',
    minWidth: '18px',
    height: '18px',
    borderRadius: '9px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
  },
  notificationDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '0.5rem',
    width: '360px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    zIndex: 1000,
  },
  dropdownHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.875rem 1rem',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  dropdownTitle: {
    fontWeight: '600',
    color: '#1e293b',
    fontSize: '0.95rem',
  },
  markAllBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    fontSize: '0.85rem',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
  },
  dropdownList: {
    maxHeight: '400px',
    overflowY: 'auto',
  },
  dropdownLoading: {
    textAlign: 'center',
    padding: '2rem',
    color: '#94a3b8',
    fontSize: '0.9rem',
  },
  dropdownEmpty: {
    textAlign: 'center',
    padding: '2rem',
    color: '#94a3b8',
    fontSize: '0.9rem',
  },
  notificationItem: {
    padding: '0.875rem 1rem',
    borderBottom: '1px solid #f1f5f9',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  notificationRead: {
    opacity: 0.7,
  },
  notificationItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.25rem',
  },
  notificationItemTitle: {
    fontWeight: '500',
    color: '#1e293b',
    fontSize: '0.9rem',
  },
  unreadDot: {
    width: '8px',
    height: '8px',
    backgroundColor: '#2563eb',
    borderRadius: '50%',
    flexShrink: 0,
  },
  notificationItemContent: {
    color: '#64748b',
    fontSize: '0.85rem',
    margin: '0 0 0.5rem 0',
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  notificationItemTime: {
    color: '#94a3b8',
    fontSize: '0.75rem',
  },
  username: {
    fontSize: '0.9rem',
    opacity: 0.9,
  },
  logoutBtn: {
    backgroundColor: 'transparent',
    border: '1px solid white',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  registerBtn: {
    backgroundColor: 'white',
    color: '#2563eb',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    textDecoration: 'none',
    fontWeight: '500',
  },
};

export default Navbar;
