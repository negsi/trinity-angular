import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatWorkspace } from './chat-workspace';

describe('ChatWorkspace', () => {
  let component: ChatWorkspace;
  let fixture: ComponentFixture<ChatWorkspace>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatWorkspace],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatWorkspace);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
