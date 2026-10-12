import { apiRequest } from './api';
import { normalizeUserSnapshot } from './userData';
export { normalizeUserSnapshot } from './userData';
export const loadUserSnapshot = async (userId) => normalizeUserSnapshot(await apiRequest(`/user-snapshot/${userId}`, 'GET'));
export const loadInterviewSummary = (interviewId) => apiRequest(`/interview-summary/${interviewId}`, 'GET');
