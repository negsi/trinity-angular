import { Injectable, signal } from '@angular/core';

export interface CurrentUser {
  id: string;
  name: string;
  avatarBg?: string;
}

/**
 * Service providing session and current user state for workspace chats.
 */
@Injectable({
  providedIn: 'root'
})
export class UserContextService {
  /** Reactive state holding current authenticated user info */
  readonly currentUser = signal<CurrentUser>({
    id: 'user',
    name: 'User'
  });

  /**
   * Updates the current active user context.
   */
  setCurrentUser(user: CurrentUser): void {
    this.currentUser.set(user);
  }
}