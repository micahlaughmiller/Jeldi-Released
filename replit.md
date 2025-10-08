# Overview

This is **Jeldi** - an enterprise ERP integration platform with a two-tier architecture:

## Product Architecture
**Overlay Layer** (Current Implementation): Unified enterprise dashboard that integrates with multiple ERP systems (SAP, NetSuite, Dynamics 365, Syteline, Epicor, etc.) to provide real-time business intelligence through a centralized dashboard. Features KPI monitoring, AI-powered data analysis, global AI assistant, customizable dashboards, and WebSocket-based real-time updates.

**Full ERP Integration Layer** (Future): Complete bidirectional ERP integration with:
- Data source reliability verification and validation
- Direct read/write capabilities within ERP systems 
- In-app ERP data updates without leaving Jeldi
- Role-based access control (project managers, finance, ops, etc.)
- Real-time synchronization between Jeldi and ERP systems

## Recent Updates (Phase 1-4 Complete)

**Phase 1 - Dashboard Customization:**
- Customizable KPI system: Select up to 5 KPIs with drag-drop reordering and role-based defaults
- Customizable chart system: Unlimited charts with 4 default charts (revenue, invoices, refunds, cancellations)
- ERP status relocated to header top-right position
- Email center UI hidden (backend preserved)

**Phase 2 - Global AI Assistant:**
- AI assistant bar available on all screens (except account/settings)
- 75/25 split-screen AI responses: top 75% current screen, bottom 25% AI answer
- Inline response panel with answer, insights, recommendations
- Minimize/maximize/close controls for AI responses

**Phase 3 - ERP Management & Security Compliance (ISO 27001 / NIST 800-53):**
- Enhanced ERP connection wizard: OAuth, API key, and custom configuration support
- Added Syteline and Epicor ERP systems
- AES-256-GCM encryption for all sensitive data at rest
- Comprehensive audit logging system (all security events tracked)
- Session management: 30-min timeout, max 3 concurrent sessions, auto-cleanup
- Password policy: 12+ chars, complexity requirements, history (last 5), account lockout (5 attempts)
- Security compliance documentation: ISO 27001 controls mapping, NIST 800-53 implementation

**Phase 4 - Universal KPI Auto-Seeding (October 2025):**
- Universal KPI architecture: Cross-ERP compatible KPIs with `erpSource='universal'` pattern
- Auto-seeding logic: New users automatically get 10 universal KPI configs + 5 default preferences
- 5 universal default KPIs: cycle_time, on_time_delivery, cost_per_unit, working_capital_efficiency, gross_margin
- Drag handle UX fix: Separate grip icon for dragging prevents delete button click interference
- Single endpoint auto-creation: GET /api/dashboard/kpi-preferences creates configs + preferences atomically
- Production-ready: All E2E tests passing (register → auto-seed → delete → customize → drag-drop)

**Phase 5 - Suggested KPIs/Charts & Multi-Environment Support (October 2025):**
- Suggested KPIs: Top 10 COO/CFO-focused KPIs displayed prominently in customization modal with amber highlighting
  - Includes cycle_time, on_time_delivery, cost_per_unit, working_capital_efficiency, gross_margin, revenue, orders, inventory, efficiency, performance
  - Each KPI includes descriptive tooltip explaining what it measures
  - "Recommended for COO/CFO" section with star icon and "Top 10" badge
- Suggested Charts: Top 10 recommended charts for COO/CFO work in chart selector
  - Amber highlighting and sparkles icon for suggested items
  - Similar UX pattern to AI assistant suggested prompts
- Multi-environment support: demo.jeldi.app vs overlay.jeldi.app routing
  - Environment detection: Automatic routing based on hostname
  - API config: Smart URL routing for Replit development, AWS Lambda production
  - Demo data service: Auto-populates demo users and ERP connections for demo.jeldi.app only
  - Production mode: overlay.jeldi.app runs with NO dummy data

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Full-Stack Architecture
- **Frontend**: React with TypeScript, Vite build system, Tailwind CSS with shadcn/ui components
- **Backend**: Express.js server with TypeScript
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Real-time Communication**: WebSocket integration for live KPI updates and system status

## Frontend Architecture
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management with local storage for auth tokens
- **UI Framework**: Radix UI primitives with custom styling via Tailwind CSS
- **Component Structure**: Modular components organized by feature (dashboard, layout, modals, ui)

## Backend Architecture
- **API Design**: RESTful endpoints with JWT-based authentication
- **Database Layer**: Drizzle ORM with connection pooling via Neon serverless
- **Service Layer**: Modular services for ERP integration, email handling, and AI analysis
- **Real-time Updates**: WebSocket server for broadcasting KPI updates and system status changes

## Authentication & Authorization
- **Strategy**: JWT tokens with bcrypt password hashing (cost factor 10)
- **Session Management**: Active session tracking with 30-minute timeout and max 3 concurrent sessions
- **User Roles**: Role-based access control system with granular permissions (admin, finance, ops_manager, etc.)
- **Security Compliance**: ISO 27001 and NIST 800-53 standards implementation
- **Data Encryption**: AES-256-GCM encryption for all sensitive data at rest
- **Audit Logging**: Comprehensive immutable audit trail for all security events

## Database Schema
- **Users**: Authentication and profile management with OAuth support
- **ERP Connections**: Flexible connection storage supporting OAuth, API key, and custom configurations
- **Sessions**: Active session tracking with IP address, user agent, expiry management
- **Audit Logs**: Immutable security event logging with full context (user, action, resource, IP, timestamp)
- **Password History**: Track last 5 passwords to prevent reuse
- **Login Attempts**: Failed login tracking for account lockout enforcement
- **KPI Configurations**: User-defined metrics with positioning and refresh intervals
- **Dashboard Preferences**: KPI and chart customization per user with role-based defaults
- **Email Configurations**: Multi-provider email settings with encrypted tokens (Gmail, Outlook)
- **Conversations & Chat History**: AI conversation logs for business intelligence queries

## AI Integration
- **Provider**: OpenAI GPT-5 for ERP data analysis and business insights
- **Functionality**: Natural language queries against ERP data with structured JSON responses
- **Features**: Trend analysis, anomaly detection, and strategic recommendations

# External Dependencies

## ERP System Integrations
- **SAP S/4HANA**: OAuth2 integration with analytics API access
- **Oracle NetSuite**: RESTlet and web services integration
- **Microsoft Dynamics 365**: Graph API integration with Office 365 connectivity
- **Infor SyteLine**: Manufacturing ERP with OAuth and API key support
- **Epicor Kinetic**: Industry-specific ERP with IoT integration, OAuth and API key support
- **Additional Systems**: Workday, IFS, Oracle Fusion, Infor, Acumatica, Sage support
- **Connection Methods**: OAuth (automatic), API Key (manual), Custom Configuration (advanced)

## Email Service Providers
- **Gmail**: Google OAuth2 with Gmail API for email sending
- **Outlook**: Microsoft Graph API for Outlook.com integration
- **Features**: Template-based email automation and multi-provider support

## Third-Party Services
- **OpenAI**: GPT-5 API for intelligent data analysis and chat functionality
- **Neon Database**: Serverless PostgreSQL with connection pooling
- **Microsoft Graph**: Outlook email integration and calendar access

## Development Tools
- **Build System**: Vite with React plugin and TypeScript support
- **Database**: Drizzle Kit for schema migrations and database management
- **UI Components**: Radix UI for accessible component primitives
- **Styling**: Tailwind CSS with custom design system variables

## Replit-Specific Features
- **Cartographer Plugin**: Development-mode navigation and debugging
- **Runtime Error Overlay**: Enhanced error handling in development
- **Connection Management**: Automated OAuth credential management for external services