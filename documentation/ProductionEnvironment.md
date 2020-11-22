TODO: add descriptions and proper workflow

Enter project account:
```
become [project id]
become wiki-stat-portal
```

Upload production build to `~/www/js`.

Needs a `service.template` file with the following configuration:
```yaml
backend: kubernetes
cpu: 1
mem: 2Gi
type: node10
```

Running webservice: `webservice --backend=kubernetes node10 start`

Stopping webservice: `webservice --backend=kubernetes node10 stop`

Webservice shell: `webservice --backend=kubernetes node10 shell`. Use this to install dependencies using `npm install` (yarn is not available).

