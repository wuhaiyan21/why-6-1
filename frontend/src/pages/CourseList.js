import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { courseAPI } from '../services/api';

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

function CourseList() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    loadCourses();
  }, [searchKeyword, sortOrder]);

  const loadCourses = async () => {
    try {
      setLoading(true);
      const params = {};
      if (searchKeyword) params.search = searchKeyword;
      params.sort = sortOrder;
      const data = await courseAPI.getCourses(params);
      setCourses(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearchKeyword(searchInput);
  };

  const handleSortChange = (e) => {
    setSortOrder(e.target.value);
  };

  if (loading) {
    return <div style={styles.loading}>加载中...</div>;
  }

  if (error) {
    return <div style={styles.error}>错误: {error}</div>;
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>课程列表</h1>
      <p style={styles.subtitle}>浏览并报名我们精选的在线课程</p>

      <div style={styles.filterBar}>
        <form onSubmit={handleSearch} style={styles.searchForm}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索课程名称..."
            style={styles.searchInput}
          />
          <button type="submit" style={styles.searchBtn}>
            搜索
          </button>
        </form>

        <div style={styles.sortWrapper}>
          <label style={styles.sortLabel}>排序方式：</label>
          <select
            value={sortOrder}
            onChange={handleSortChange}
            style={styles.sortSelect}
          >
            <option value="asc">开课时间升序</option>
            <option value="desc">开课时间降序</option>
          </select>
        </div>
      </div>
      
      <div style={styles.grid}>
        {courses.map(course => (
          <div key={course.id} style={styles.card}>
            <h2 style={styles.courseTitle}>{course.title}</h2>
            <p style={styles.description}>
              {course.description?.substring(0, 100)}
              {course.description?.length > 100 ? '...' : ''}
            </p>
            
            <div style={styles.info}>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>开课时间</span>
                <span style={styles.infoValue}>{formatDate(course.startDate)}</span>
              </div>
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>剩余名额</span>
                <span style={{
                  ...styles.infoValue,
                  color: course.remainingSlots > 0 ? '#16a34a' : '#dc2626',
                  fontWeight: 'bold',
                }}>
                  {course.remainingSlots} / {course.capacity}
                </span>
              </div>
            </div>

            <div style={styles.footer}>
              {course.remainingSlots > 0 ? (
                <span style={styles.available}>可报名</span>
              ) : (
                <span style={styles.full}>已满员</span>
              )}
              <Link to={`/courses/${course.id}`} style={styles.detailLink}>
                查看详情 →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {courses.length === 0 && (
        <div style={styles.empty}>暂无课程</div>
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
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
    color: '#1e293b',
  },
  subtitle: {
    color: '#64748b',
    marginBottom: '2rem',
  },
  filterBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  searchForm: {
    display: 'flex',
    gap: '0.5rem',
    flex: 1,
    maxWidth: '400px',
  },
  searchInput: {
    flex: 1,
    padding: '0.625rem 1rem',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '0.95rem',
    outline: 'none',
  },
  searchBtn: {
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '0.625rem 1.25rem',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  sortWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  sortLabel: {
    fontSize: '0.9rem',
    color: '#64748b',
  },
  sortSelect: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '0.95rem',
    outline: 'none',
    backgroundColor: 'white',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '1.5rem',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
  },
  courseTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '0.75rem',
    color: '#1e293b',
  },
  description: {
    color: '#64748b',
    fontSize: '0.95rem',
    marginBottom: '1rem',
    flexGrow: 1,
    lineHeight: 1.5,
  },
  info: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #e2e8f0',
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
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '1rem',
    borderTop: '1px solid #e2e8f0',
  },
  available: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.8rem',
    fontWeight: '500',
  },
  full: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.8rem',
    fontWeight: '500',
  },
  detailLink: {
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '0.9rem',
    fontWeight: '500',
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
  },
  empty: {
    textAlign: 'center',
    padding: '3rem',
    color: '#64748b',
  },
};

export default CourseList;
