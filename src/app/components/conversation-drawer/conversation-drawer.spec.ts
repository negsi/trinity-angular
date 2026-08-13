import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ConversationDrawer } from "./conversation-drawer";

describe("ConversationDrawer", () => {
  let component: ConversationDrawer;
  let fixture: ComponentFixture<ConversationDrawer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConversationDrawer],
    }).compileComponents();

    fixture = TestBed.createComponent(ConversationDrawer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
