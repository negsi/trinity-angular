import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideMarkdown, MARKED_OPTIONS, KATEX_OPTIONS } from 'ngx-markdown';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideMarkdown({
      markedOptions: {
        provide: MARKED_OPTIONS,
        useValue: {
          gfm: true,
          breaks: true
        }
      },
      katexOptions: {
        provide: KATEX_OPTIONS,
        useValue: {
          nonStandard: true,
          throwOnError: false
        }
      }
    })
  ]
};