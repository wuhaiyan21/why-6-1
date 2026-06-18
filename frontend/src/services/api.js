const API_BASE = '/api';

async function request(url, options = {}) {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

export const authAPI = {
  register: (username, email, password) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),

  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  getMe: () => request('/auth/me'),
};

export const courseAPI = {
  getCourses: () => request('/courses'),

  getCoursesAdmin: () => request('/courses?includeInactive=true'),

  getCourse: (id) => request(`/courses/${id}`),

  createCourse: (courseData) =>
    request('/courses', {
      method: 'POST',
      body: JSON.stringify(courseData),
    }),

  updateCourse: (id, courseData) =>
    request(`/courses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(courseData),
    }),

  deleteCourse: (id) =>
    request(`/courses/${id}`, {
      method: 'DELETE',
    }),

  closeCourse: (id) =>
    request(`/courses/${id}/close`, {
      method: 'POST',
    }),

  reopenCourse: (id) =>
    request(`/courses/${id}/reopen`, {
      method: 'POST',
    }),
};

export const enrollmentAPI = {
  enroll: (courseId) =>
    request(`/courses/${courseId}/enroll`, {
      method: 'POST',
    }),

  joinWaitlist: (courseId) =>
    request(`/courses/${courseId}/waitlist`, {
      method: 'POST',
    }),

  cancelWaitlist: (courseId) =>
    request(`/courses/${courseId}/waitlist/cancel`, {
      method: 'POST',
    }),

  getWaitlistStatus: (courseId) =>
    request(`/courses/${courseId}/waitlist/status`),

  getWaitlistCount: (courseId) =>
    request(`/courses/${courseId}/waitlist/count`),

  pay: (enrollmentId) =>
    request(`/enrollments/${enrollmentId}/pay`, {
      method: 'POST',
    }),

  cancel: (enrollmentId) =>
    request(`/enrollments/${enrollmentId}/cancel`, {
      method: 'POST',
    }),

  requestRefund: (enrollmentId, reason) =>
    request(`/enrollments/${enrollmentId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  extendPayment: (enrollmentId) =>
    request(`/enrollments/${enrollmentId}/extend`, {
      method: 'POST',
    }),

  getMyEnrollments: () => request('/my-enrollments'),

  checkPrerequisites: (courseId) =>
    request(`/courses/${courseId}/prerequisites/check`),
};

export const notificationAPI = {
  getNotifications: (unreadOnly = false) =>
    request(`/notifications${unreadOnly ? '?unreadOnly=true' : ''}`),

  getUnreadCount: () => request('/notifications/unread-count'),

  markAsRead: (notificationId) =>
    request(`/notifications/${notificationId}/read`, {
      method: 'PUT',
    }),

  markAllAsRead: () =>
    request('/notifications/read-all', {
      method: 'PUT',
    }),

  markCourseAsRead: (courseId) =>
    request(`/notifications/course/${courseId}/read`, {
      method: 'PUT',
    }),
};

export const adminAPI = {
  getEnrollments: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return request(`/admin/enrollments${queryString ? `?${queryString}` : ''}`);
  },

  exportEnrollments: (params = {}) => {
    const token = localStorage.getItem('token');
    const queryString = new URLSearchParams(params).toString();
    return fetch(`/api/admin/enrollments/export${queryString ? `?${queryString}` : ''}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }).then(response => {
      if (!response.ok) {
        throw new Error('Export failed');
      }
      return response.blob();
    });
  },

  getWaitlists: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return request(`/admin/waitlists${queryString ? `?${queryString}` : ''}`);
  },

  exportWaitlists: (params = {}) => {
    const token = localStorage.getItem('token');
    const queryString = new URLSearchParams(params).toString();
    return fetch(`/api/admin/waitlists/export${queryString ? `?${queryString}` : ''}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }).then(response => {
      if (!response.ok) {
        throw new Error('Export failed');
      }
      return response.blob();
    });
  },

  approveRefund: (enrollmentId) =>
    request(`/admin/enrollments/${enrollmentId}/refund/approve`, {
      method: 'POST',
    }),

  rejectRefund: (enrollmentId, reason) =>
    request(`/admin/enrollments/${enrollmentId}/refund/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};
