import type { CanvasElement, Project, ProjectWithElements } from '@canvas/shared';
import { api } from './api';

export const listProjects = async (archived = false): Promise<Project[]> => {
  const { data } = await api.get<Project[]>('/projects', { params: { archived: String(archived) } });
  return data;
};

export const createProject = async (title?: string): Promise<Project> => {
  const { data } = await api.post<Project>('/projects', title ? { title } : {});
  return data;
};

export const getProject = async (id: string): Promise<ProjectWithElements> => {
  const { data } = await api.get<ProjectWithElements>(`/projects/${id}`);
  return data;
};

export const updateProject = async (
  id: string,
  patch: { title?: string; appState?: Partial<Project['appState']>; isArchived?: boolean; thumbnail?: string },
): Promise<Project> => {
  const { data } = await api.patch<Project>(`/projects/${id}`, patch);
  return data;
};

export const deleteProject = async (id: string): Promise<void> => {
  await api.delete(`/projects/${id}`);
};

export interface BatchResult {
  ok: boolean;
  version: number;
  upserted: number;
  deleted: number;
}

export const saveElementBatch = async (
  projectId: string,
  upserts: CanvasElement[],
  deletes: string[],
): Promise<BatchResult> => {
  const { data } = await api.post<BatchResult>(`/projects/${projectId}/elements/batch`, {
    upserts,
    deletes,
  });
  return data;
};
