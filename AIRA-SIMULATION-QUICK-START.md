# AIRA Simulation Framework - Quick Start Guide

## 🚀 30-Second Summary

```bash
cd backend
npm run simulate
```

That's it. The framework will:
1. ✅ Simulate 14 companies with realistic incident scenarios
2. ✅ Run ~40-60 incidents per company (30-day simulation)
3. ✅ Compare AIRA vs Datadog+PagerDuty vs Manual modes
4. ✅ Generate comprehensive reports with findings

**Expected runtime**: 2-5 minutes  
**Output location**: `backend/simulation/results/`

## 📊 What You Get

### Raw Data Files
- **aggregate_results.json** — Full data for all 14 companies
- **{CompanyName}_results.json** — Per-company detailed breakdown (14 files)

### Analysis Files
- **comparison_report.json** — Cross-mode comparisons and insights
- **SIMULATION_REPORT.md** — Executive summary (human-readable!)
- **simulation_results.csv** — Spreadsheet export for Excel/Sheets

## 🎯 Key Outputs at a Glance

After running the simulation, you'll see metrics like:

### Overall Performance (across all 14 companies)

**AIRA (Autonomous)**
- Success Rate: ~85%
- Avg MTTR: ~45s per incident
- Monthly Downtime: ~120m

**Datadog+PagerDuty (Human)**
- Success Rate: ~78%
- Avg MTTR: ~4m 30s per incident
- Monthly Downtime: ~300m

**Manual Only**
- Success Rate: ~65%
- Avg MTTR: ~12m per incident
- Monthly Downtime: ~800m

### AIRA Advantage
- ✅ **40-50% faster** MTTR vs Datadog
- ✅ **70-80% faster** MTTR vs Manual
- ✅ **$100K+/month cost savings** across all companies
- ✅ **10-20% better success rate** from automation

## 📁 Folder Structure

```
backend/
├── run-simulation.js           ← Main entry point
├── package.json                ← npm scripts defined here
└── simulation/
    ├── companies/              ← 14 company profiles (JSON)
    ├── scenarios/              ← 7 incident scenario definitions
    ├── engine/                 ← Core simulation logic
    │   ├── SimulationRunner.js       (orchestrator)
    │   ├── IncidentGenerator.js      (realistic incident generation)
    │   ├── MetricsCollector.js       (metrics tracking)
    │   ├── AIRAMode.js               (AIRA simulation)
    │   ├── DatadogMode.js            (Human+Datadog simulation)
    │   └── ManualMode.js             (Manual-only simulation)
    ├── comparisons/            ← Analysis engines
    │   ├── ComparisonEngine.js        (cross-mode analysis)
    │   └── ReportGenerator.js         (report generation)
    ├── results/                ← Output files (auto-generated)
    └── README.md               ← Complete documentation
```

## 🔧 Common Tasks

### Run Full Simulation (Recommended)
```bash
npm run simulate
```

### Run Simulation and Clear Previous Results
```bash
npm run simulate:clean
```

### Analyze Results Manually
```bash
# Check AIRA vs Datadog comparison
cat simulation/results/comparison_report.json | grep "comparative_analysis"

# View per-company results
cat simulation/results/StripeCore_results.json | grep "aira_results"
```

## 📈 Understanding the Results

### MTTR (Mean Time To Recovery)
```
Lower is better!

AIRA:     45s  ← Fast (automated)
Datadog:  4m   ← Medium (human response)
Manual:   12m  ← Slow (pure human)
```

### Success Rate
```
Higher is better!

AIRA:     85%  ← Few failures
Datadog:  78%  ← Some human errors
Manual:   65%  ← Many human errors
```

### Monthly Downtime
```
Lower is better!

AIRA:     120 minutes  ← ~2 hours
Datadog:  300 minutes  ← ~5 hours → $X cost
Manual:   800 minutes  ← ~13 hours → $Y cost
```

## 🎯 How It Works

### 1. Incident Generation
- Realistic Poisson distribution for incident timing
- Company-specific incident frequencies
- 95% detection accuracy (5% false positives like real systems)

### 2. Three Response Modes Run in Parallel

**AIRA Mode:**
- Detection: 2-8 seconds (very fast)
- Decision: 0.5-1.5 seconds (deterministic)
- Action: 3-60 seconds (scenario-dependent)
- Success: 65-90% (based on policy effectiveness)

**Datadog Mode (Human):**
- Alert: 5-30 seconds
- Human response: 2-30 minutes (based on on-call)
- Variability: ~30% execution variance
- Success: 60-85% (includes human error)

**Manual Mode:**
- Detection: 5-15 minutes (user notices)
- Response: 5-20 minutes (person responds)
- Variability: ±50% (very unpredictable)
- Success: 50-70% (high error rate)

### 3. Metrics Collected Per Incident

For each incident, the framework tracks:
- Detection time
- Response time
- Resolution time (MTTR)
- Success/failure
- Downtime in minutes
- Estimated cost impact

### 4. Analysis

Automatically generates:
- Per-company comparisons
- Category breakdowns (SRE-heavy, FinTech, etc.)
- Cost savings analysis
- Key findings and recommendations

## 📊 The 14 Companies

### SRE-Heavy (BEST for AIRA)
1. **StripeCore** - Payment processing
2. **ScaleOps** - Cloud automation
3. **DataForge** - Analytics/ETL
4. **StreamFlow** - Real-time streaming

### FinTech/SaaS (HIGH reliability)
5. **FinEdge** - Banking
6. **PayLink** - Payment gateway
7. **LedgerLoop** - Accounting
8. **SecureTrade** - Trading

### Repeated Incidents (MID)
9. **ShopGrid** - E-commerce
10. **RideSync** - Ride-sharing
11. **FoodDashX** - Food delivery
12. **NotifyHub** - Notifications

### Edge Cases (POOR FIT)
13. **EarlyStageX** - Weak observability
14. **LegacyStack** - Non-containerized

## 🔍 Interpreting Results

### Strong AIRA Performance
```
✅ Success rate > 85%
✅ MTTR 50% faster
✅ Cost savings > $20K/month

→ DEPLOY AIRA
```

### Moderate Performance
```
⚠️ Success rate 70-85%
⚠️ MTTR 30-50% faster
⚠️ Cost savings $10K-20K/month

→ Use hybrid approach
→ Improve observability
```

### Poor Performance
```
❌ Success rate < 70%
❌ MTTR < 30% faster
❌ Cost savings < $10K

→ Improve monitoring first
→ Wait before deploying
```

## 🛠️ Customization

### Change a Company's Profile
Edit `simulation/companies/YourCompany.json`:

```json
{
  "average_incidents_per_day": 5.0,    // More incidents
  "observability_maturity": "high",    // Better detection
  "automation_maturity": "medium",     // Fewer errors
  "sla_target_minutes": 10             // Your SLA
}
```

### Add a New Scenario
1. Create `simulation/scenarios/new_scenario.json`
2. Define trigger, actions, success rate
3. Regenerate results: `npm run simulate`

### Adjust Simulation Duration
Edit `backend/simulation/engine/SimulationRunner.js`:
```javascript
this.simulationDurationDays = 60;  // 60 days instead of 30
```

## 📈 Generated Reports

### simulation_results.csv
Open in Excel/Sheets for easy comparison:
```
Company,AIRA Success,Datadog Success,AIRA MTTR,Datadog MTTR,...
StripeCore,92,85,32,245,...
ScaleOps,88,80,45,320,...
...
```

### SIMULATION_REPORT.md
Human-readable markdown report with:
- Executive summary
- Category-by-category analysis
- Per-company findings
- Cost impact calculations
- Recommendations

### comparison_report.json
Raw analysis data (for programmatic use):
```json
{
  "summary": { ... },
  "overall_metrics": { ... },
  "comparative_analysis": { ... },
  "category_breakdown": { ... },
  "key_insights": [ ... ]
}
```

## ⚙️ Technical Details

### Metrics Collected
- **MTTR** (seconds) - Total time from detection to resolution
- **Detection Time** (seconds) - Time to identify incident
- **Response Time** (seconds) - Time to start action
- **Success Rate** (%) - Percentage of incidents resolved
- **Downtime** (minutes) - Business impact
- **Cost Impact** ($) - Estimated loss

### Incident Distribution
Uses Poisson distribution to model realistic incident patterns:
- Incidents come in bursts (not evenly spaced)
- Some days have many, some days have few
- Matches real-world behavior

### Response Time Models

**AIRA**: 
```
detection (2-8s) + decision (0.5-1.5s) + execution (3-60s)
= 5.5s to 70s TOTAL
```

**Datadog**:
```
alert (5-30s) + human response (2-30m) + execution (2-20m)
= 2m 7s to 50m TOTAL
```

**Manual**:
```
detection (5-15m) + response (5-20m) + execution (5-30m)
= 15m to 65m TOTAL
```

## 🐛 Troubleshooting

### "No results generated"
- Check `simulation/companies/` - should have JSON files
- Check `simulation/scenarios/` - should have incident definitions
- Delete `simulation/results/` and try again

### "Very low success rates"
- This might be realistic for your company profile!
- Check `observability_maturity` - low observability = harder to fix
- Review the detailed incident records in results

### "Want to simulate different companies"
- Edit or add company profiles in `simulation/companies/`
- Modify probability/frequency/characteristics
- Re-run: `npm run simulate`

## 🚀 Next Steps

1. **Run the simulation**: `npm run simulate`
2. **Review results**: Open `SIMULATION_REPORT.md`
3. **Check your company**: Find your profile in results
4. **Email findings**: Share comparison_report.json with team
5. **Customize**: Adjust company profiles to match your environment

## 📚 More Information

- Full documentation: `backend/simulation/README.md`
- Company profiles: `backend/simulation/companies/`
- Scenario definitions: `backend/simulation/scenarios/`
- Engine code: `backend/simulation/engine/`

## ❓ Questions?

Check the detailed README in `backend/simulation/README.md` for:
- Advanced configuration options
- Custom response patterns  
- Adding new companies/scenarios
- Extending the framework
- Performance tuning

---

**Ready?** Just run: `npm run simulate` ✅
