import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app'; // Achte darauf: './app/app.component' statt './app/app' !

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));