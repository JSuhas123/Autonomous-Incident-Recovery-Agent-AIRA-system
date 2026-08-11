'use strict';

const { mapParameters } = require('../../playbooks/parameters/playbookParameterMapper');

function ctx() {
  return {
    incident: {
      type:     'CrashLoopBackOff',
      severity: 'P1',
      resource: {
        pod:       'my-pod-abc123',
        namespace: 'default',
        cluster:   'prod-cluster',
      },
    },
    signal: {
      labels: {
        app:       'my-app',
        namespace: 'default',
      },
    },
    context: {
      cluster: 'prod-cluster',
    },
    evidence: {
      logs: 'OOM error',
    },
    service: {
      name: 'my-service',
    },
    constants: {
      default_timeout: 30,
    },
    stage_output: {
      pod_status: 'Running',
    },
  };
}

describe('PlaybookParameterMapper', () => {

  describe('basic resolution', () => {
    it('resolves a simple incident path', () => {
      const { mapped, missing } = mapParameters({ pod: '${incident.resource.pod}' }, ctx());
      expect(mapped.pod).toBe('my-pod-abc123');
      expect(missing).toHaveLength(0);
    });

    it('resolves nested signal path', () => {
      const { mapped } = mapParameters({ app: '${signal.labels.app}' }, ctx());
      expect(mapped.app).toBe('my-app');
    });

    it('resolves context path', () => {
      const { mapped } = mapParameters({ cluster: '${context.cluster}' }, ctx());
      expect(mapped.cluster).toBe('prod-cluster');
    });

    it('resolves constants path', () => {
      const { mapped } = mapParameters({ timeout: '${constants.default_timeout}' }, ctx());
      expect(mapped.timeout).toBe(30);
    });

    it('resolves stage_output path', () => {
      const { mapped } = mapParameters({ status: '${stage_output.pod_status}' }, ctx());
      expect(mapped.status).toBe('Running');
    });

    it('returns constant scalar values as-is', () => {
      const { mapped } = mapParameters({ port: 8080, enabled: true }, ctx());
      expect(mapped.port).toBe(8080);
      expect(mapped.enabled).toBe(true);
    });

    it('returns literal string as-is (no template)', () => {
      const { mapped } = mapParameters({ mode: 'dry-run' }, ctx());
      expect(mapped.mode).toBe('dry-run');
    });
  });

  describe('interpolated strings', () => {
    it('interpolates mixed string', () => {
      const { mapped } = mapParameters({ label: '${incident.resource.namespace}/${incident.resource.pod}' }, ctx());
      expect(mapped.label).toBe('default/my-pod-abc123');
    });
  });

  describe('missing values', () => {
    it('adds to missing when path resolves to undefined', () => {
      const { missing } = mapParameters({ x: '${incident.resource.nonexistent}' }, ctx());
      expect(missing).toContain('x');
    });

    it('adds to missing when path resolves to empty string', () => {
      const c = { ...ctx(), incident: { ...ctx().incident, resource: { pod: '' } } };
      const { missing } = mapParameters({ pod: '${incident.resource.pod}' }, c);
      expect(missing).toContain('pod');
    });
  });

  describe('security — forbidden patterns', () => {
    const forbiddenMappings = [
      ['eval', '${eval(incident.resource.pod)}'],
      ['Function', '${Function("return 1")()}'],
      ['require', '${require("fs").readFileSync("/etc/passwd")}'],
      ['process', '${process.env.SECRET}'],
      ['semicolon', '${incident.resource.pod; process.exit()}'],
      ['backtick', '${`${incident.resource.pod}`}'],
      ['nested template', '${${incident.resource.pod}}'],
      ['prototype', '${__proto__.x}'],
      ['constructor', '${constructor.name}'],
    ];

    for (const [name, expr] of forbiddenMappings) {
      it(`rejects ${name} expression`, () => {
        const { errors } = mapParameters({ x: expr }, ctx());
        expect(errors.some(e => e.key === 'x')).toBe(true);
      });
    }
  });

  describe('security — unknown roots', () => {
    it('errors on unknown root object', () => {
      const { errors } = mapParameters({ x: '${globalThis.process.env.SECRET}' }, ctx());
      expect(errors.some(e => e.key === 'x')).toBe(true);
    });

    it('errors on "global" root', () => {
      const { errors } = mapParameters({ x: '${global.process}' }, ctx());
      expect(errors.some(e => e.key === 'x')).toBe(true);
    });
  });

  describe('security — path depth', () => {
    it('errors on path exceeding 5 levels', () => {
      const { errors } = mapParameters({ x: '${incident.a.b.c.d.e.f}' }, ctx());
      expect(errors.some(e => e.key === 'x')).toBe(true);
    });

    it('accepts path at exactly 5 levels', () => {
      const c = { incident: { a: { b: { c: { d: 'value' } } } } };
      const { mapped } = mapParameters({ x: '${incident.a.b.c.d}' }, c);
      expect(mapped.x).toBe('value');
    });
  });

  describe('security — blocked segments', () => {
    it('errors on __proto__ in path', () => {
      const { errors } = mapParameters({ x: '${incident.__proto__.polluted}' }, ctx());
      expect(errors.some(e => e.key === 'x')).toBe(true);
    });

    it('errors on constructor in path', () => {
      const { errors } = mapParameters({ x: '${incident.constructor.name}' }, ctx());
      expect(errors.some(e => e.key === 'x')).toBe(true);
    });
  });

  describe('sensitive parameters', () => {
    it('redacts sensitive values in provenance', () => {
      const paramDefs = [{ name: 'secret', sensitive: true, required: false }];
      const { provenance } = mapParameters(
        { secret: '${constants.mySecret}' },
        { constants: { mySecret: 'supersecret' } },
        paramDefs,
      );
      const entry = provenance.find(p => p.key === 'secret');
      expect(entry).toBeTruthy();
      expect(entry.value).toBe('[REDACTED]');
      expect(entry.sensitive).toBe(true);
    });

    it('does not redact non-sensitive values', () => {
      const { provenance } = mapParameters({ ns: '${incident.resource.namespace}' }, ctx());
      const entry = provenance.find(p => p.key === 'ns');
      expect(entry.value).toBe('default');
    });
  });

  describe('empty / null inputs', () => {
    it('returns empty result for null mappings', () => {
      const { mapped, missing, errors } = mapParameters(null, ctx());
      expect(mapped).toEqual({});
      expect(missing).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('returns empty result for empty mappings', () => {
      const { mapped } = mapParameters({}, ctx());
      expect(mapped).toEqual({});
    });
  });
});
