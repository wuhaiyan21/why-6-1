import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Navbar() {
  const { user, logout, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();

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
