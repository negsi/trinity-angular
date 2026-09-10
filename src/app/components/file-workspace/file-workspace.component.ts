import { Component, input, inject, signal, computed, effect, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiAgentService } from '../../services/agent.service';
import { ApiChatService, ConversationFile } from '../../services/chat.service';

export interface FileTreeNode {
  name: string;
  path: string; 
  isFolder: boolean;
  file?: ConversationFile;
  children?: FileTreeNode[];
  expanded?: boolean;
  isEditing?: boolean;
}

@Component({
  selector: 'app-file-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './file-workspace.component.html',
  styleUrl: './file-workspace.component.scss'
})
export class FileWorkspaceComponent {
  readonly agentService = inject(ApiAgentService);
  private readonly chatService = inject(ApiChatService);

  /** Mode indicator signal */
  readonly isLightMode = input.required<boolean>();

  /** State Signals */
  readonly files = signal<ConversationFile[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly selectedNode = signal<FileTreeNode | null>(null);

  /** Inline folder creation state */
  readonly inlineCreating = signal<boolean>(false);
  readonly newFolderName = signal<string>('');
  private pendingParentPath: string = '';

  @ViewChild('folderInput') folderInput?: ElementRef<HTMLInputElement>;

  /**
   * Transforms flat file/directory array into hierarchical tree structure.
   */
  readonly treeData = computed<FileTreeNode[]>(() => {
    const rawFiles = this.files();
    const activeConvId = this.agentService.activeConversationId();
    const root: FileTreeNode[] = [];

    for (const item of rawFiles) {
      let normalizedPath = (item.file_path || item.name).replace(/\\/g, '/');

      if (activeConvId && normalizedPath.includes(activeConvId)) {
        const parts = normalizedPath.split(activeConvId);
        normalizedPath = parts[parts.length - 1];
      }

      normalizedPath = normalizedPath.replace(/^\//, '');
      const parts = normalizedPath.split('/').filter((p) => p.length > 0);

      let currentLevel = root;
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (isLast) {
          if (item.is_dir) {
            let folder = currentLevel.find((node) => node.isFolder && node.name === part);
            if (!folder) {
              currentLevel.push({
                name: part,
                path: currentPath,
                isFolder: true,
                children: [],
                expanded: true
              });
            }
          } else {
            currentLevel.push({
              name: item.name || part,
              path: currentPath,
              isFolder: false,
              file: item
            });
          }
        } else {
          let folder = currentLevel.find((node) => node.isFolder && node.name === part);
          if (!folder) {
            folder = {
              name: part,
              path: currentPath,
              isFolder: true,
              children: [],
              expanded: true
            };
            currentLevel.push(folder);
          }
          currentLevel = folder.children!;
        }
      }
    }

    const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
      nodes.sort((a, b) => {
        if (a.isEditing) return -1;
        if (b.isEditing) return 1;
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

      for (const node of nodes) {
        if (node.isFolder && node.children?.length) {
          sortNodes(node.children);
        }
      }

      return nodes;
    };

    // Inject inline editing node if active
    if (this.inlineCreating()) {
      const editNode: FileTreeNode = {
        name: '',
        path: '',
        isFolder: true,
        isEditing: true
      };

      if (!this.pendingParentPath) {
        root.unshift(editNode);
      } else {
        const findAndInject = (nodes: FileTreeNode[]): boolean => {
          for (const node of nodes) {
            if (node.isFolder && node.path === this.pendingParentPath) {
              node.expanded = true;
              node.children = node.children || [];
              node.children.unshift(editNode);
              return true;
            }
            if (node.children && findAndInject(node.children)) {
              return true;
            }
          }
          return false;
        };

        if (!findAndInject(root)) {
          root.unshift(editNode);
        }
      }
    }

    return sortNodes(root);
  });

  constructor() {
    effect(() => {
      const agent = this.agentService.selectedAgent();
      const activeConvId = this.agentService.activeConversationId();

      if (agent?.id && activeConvId) {
        this.loadFiles(agent.id, activeConvId);
      } else {
        this.files.set([]);
        this.selectedNode.set(null);
      }
    });
  }

  loadFiles(agentId: string, conversationId: string): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.chatService.getConversationFiles(agentId, conversationId).subscribe({
      next: (data) => {
        this.files.set(data);
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        console.error('Error fetching conversation files:', err);
        this.error.set('Fehler beim Laden der Dateien.');
        this.isLoading.set(false);
      }
    });
  }

  selectNode(node: FileTreeNode, event: MouseEvent): void {
    event.stopPropagation();
    if (node.isEditing) return;

    if (this.selectedNode() === node) {
      this.selectedNode.set(null);
    } else {
      this.selectedNode.set(node);
    }
  }

  clearSelection(): void {
    this.selectedNode.set(null);
  }

  toggleFolder(node: FileTreeNode, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    if (node.isFolder) {
      node.expanded = !node.expanded;
    }
  }

  onCreateFolder(): void {
    if (this.inlineCreating()) return;

    const selected = this.selectedNode();
    this.pendingParentPath = selected && selected.isFolder ? selected.path : '';
    this.newFolderName.set('Neuer Ordner');
    this.inlineCreating.set(true);

    setTimeout(() => {
      if (this.folderInput?.nativeElement) {
        this.folderInput.nativeElement.focus();
        this.folderInput.nativeElement.select();
      }
    }, 0);
  }

  submitNewFolder(): void {
    if (!this.inlineCreating()) return;

    const name = this.newFolderName().trim();
    if (!name) {
      this.cancelNewFolder();
      return;
    }

    const agent = this.agentService.selectedAgent();
    const activeConvId = this.agentService.activeConversationId();

    if (!agent?.id) {
      console.error('No agent selected for folder creation.');
      this.cancelNewFolder();
      return;
    }

    // Abfragen, ob eine aktive Konversation existiert
    if (!activeConvId) {
      console.warn('Keine aktive Konversation vorhanden. Ordner können erst nach Start einer Konversation erstellt werden.');
      this.error.set('Bitte starte zuerst eine Konversation, bevor du Ordner erstellst.');
      this.cancelNewFolder();
      return;
    }

    const fullPath = this.pendingParentPath ? `${this.pendingParentPath}/${name}` : name;
    this.createFolderOnBackend(agent.id, activeConvId, fullPath);

    this.inlineCreating.set(false);
    this.newFolderName.set('');
    this.pendingParentPath = '';
  }

  cancelNewFolder(): void {
    this.inlineCreating.set(false);
    this.newFolderName.set('');
    this.pendingParentPath = '';
  }

  private createFolderOnBackend(agentId: string, conversationId: string, folderPath: string): void {
    this.chatService.createConversationFolder(agentId, conversationId, folderPath).subscribe({
      next: (createdFolder) => {
        this.files.update((currentFiles) => [...currentFiles, createdFolder]);
      },
      error: (err: unknown) => {
        console.error('Error creating folder on backend:', err);
        this.error.set('Fehler beim Erstellen des Ordners.');
      }
    });
  }

  formatSize(bytes: number = 0): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getFileIcon(mimeType: string = '', filename: string = ''): string {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (mimeType.includes('image') || ['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext || '')) {
      return 'image';
    }
    if (mimeType.includes('pdf') || ext === 'pdf') {
      return 'picture_as_pdf';
    }
    if (mimeType.includes('json') || ['js', 'ts', 'py', 'html', 'css', 'scss', 'json'].includes(ext || '')) {
      return 'code';
    }
    if (mimeType.includes('text') || ['txt', 'md', 'log'].includes(ext || '')) {
      return 'description';
    }
    return 'insert_drive_file';
  }

  refreshFiles(): void {
    const agent = this.agentService.selectedAgent();
    const activeConvId = this.agentService.activeConversationId();

    if (agent?.id && activeConvId) {
      this.loadFiles(agent.id, activeConvId);
    }
  }

  onDeleteSelectedNode(): void {
    const selected = this.selectedNode();
    if (!selected) return;

    const agent = this.agentService.selectedAgent();
    const activeConvId = this.agentService.activeConversationId();

    if (!agent?.id || !activeConvId) return;

    if (selected.isFolder) {
      this.chatService
        .deleteConversationFolder(agent.id, activeConvId, selected.path)
        .subscribe({
          next: () => {
            this.selectedNode.set(null);
            this.refreshFiles();
          },
          error: (err: unknown) => {
            console.error('Error deleting folder:', err);
            this.error.set('Fehler beim Löschen des Ordners.');
          }
        });
    } else {
      this.chatService
        .deleteConversationFile(agent.id, activeConvId, selected.path)
        .subscribe({
          next: () => {
            this.selectedNode.set(null);
            this.refreshFiles();
          },
          error: (err: unknown) => {
            console.error('Error deleting file:', err);
            this.error.set('Fehler beim Löschen der Datei.');
          }
        });
    }
  }

  // Trigger file dialog
  onUploadFilesClick(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  // Handle selected files with Lazy Conversation Creation & Root fallback
  onFilesSelected(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const agent = this.agentService.selectedAgent();
  const activeConvId = this.agentService.activeConversationId();

  if (!agent?.id || !activeConvId) {
    console.warn('Keine aktive Konversation vorhanden.');
    input.value = '';
    return;
  }

  const filesToUpload = Array.from(input.files);
  const selected = this.selectedNode();
  let targetFolder = '';

  if (selected) {
    if (selected.isFolder) {
      targetFolder = selected.path;
    } else {
      const lastSlashIndex = selected.path.lastIndexOf('/');
      targetFolder = lastSlashIndex !== -1 ? selected.path.substring(0, lastSlashIndex) : '';
    }
  }

  this.chatService
    .uploadConversationFiles(agent.id, activeConvId, filesToUpload, targetFolder)
    .subscribe({
      next: () => {
        input.value = '';
        this.refreshFiles();
      },
      error: (err: unknown) => {
        console.error('Upload error:', err);
        this.error.set('Fehler beim Hochladen der Dateien.');
        input.value = '';
      }
    });
}

  private uploadFilesToFolder(
    agentId: string, 
    conversationId: string, 
    files: File[], 
    input: HTMLInputElement
  ): void {
    const selected = this.selectedNode();
    let targetFolder = '';

    if (selected) {
      if (selected.isFolder) {
        targetFolder = selected.path;
      } else {
        const lastSlashIndex = selected.path.lastIndexOf('/');
        targetFolder = lastSlashIndex !== -1 ? selected.path.substring(0, lastSlashIndex) : '';
      }
    }

    this.chatService
      .uploadConversationFiles(agentId, conversationId, files, targetFolder)
      .subscribe({
        next: () => {
          input.value = '';
          this.refreshFiles();
        },
        error: (err: unknown) => {
          console.error('Upload error:', err);
          this.error.set('Fehler beim Hochladen der Dateien.');
          input.value = '';
        }
      });
  }

  downloadFile(node: FileTreeNode, event: MouseEvent): void {
    event.stopPropagation();
    const convId = this.agentService.activeConversationId();
    if (!convId || !node.file) return;

    const url = this.chatService.getFileDownloadUrl(convId, node.path);
    window.open(url, '_blank');
  }
}