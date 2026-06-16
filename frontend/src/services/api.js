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
};

export const enrollmentAPI = {
  enroll: (courseId) =>
    request(`/courses/${courseId}/enroll`, {
      method: 'POST',
    }),

  pay: (enrollmentId) =>
    request(`/enrollments/${enrollmentId}/pay`, {
      method: 'POST',
    }),

  cancel: (enrollmentId) =>
    request(`/enrollments/${enrollmentId}/cancel`, {
      method: 'POST',
    }),

  getMyEnrollments: () => request('/my-enrollments'),

  checkPrerequisites: (courseId) =>
    request(`/courses/${courseId}/prerequisites/check`),
};
