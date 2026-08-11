import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgentConfig } from './agent-config';

describe('AgentConfig', () => {
  let component: AgentConfig;
  let fixture: ComponentFixture<AgentConfig>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentConfig],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentConfig);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
