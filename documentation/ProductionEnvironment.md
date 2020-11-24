WikiStatPortal runs on the WikiMedia ToolForge.

# Project account

To manage jobs and web services, you must use the job account:
```
become [project id]
become wiki-stat-portal
```

# Webservice
Upload production build to `~/www/js` (of the project account).

It requires a `service.template` file with the following configuration:
```yaml
backend: kubernetes
cpu: 1
mem: 2Gi
type: node10
```

To run the webservice, run: `webservice --backend=kubernetes node10 start`

To stop the webservice, run: `webservice --backend=kubernetes node10 stop`

For a webservice shell you can use: `webservice --backend=kubernetes node10 shell`.
Use this to install dependencies using `npm install` (yarn is not available). For the normal project account, node.js 10 is not available.

# Setting up continuous job
The main command which runs caching of the edit statistics must be run periodically. The job will be scheduled on a job server using the `jsub` command:

```
jsub -cwd -mem 2g -once -N wikiStatPortal-dataCacher node ./tools-out/tools/dataCacher/dataCacher
```
where
* `-cwd` means that the current working directory (`~/tools`) will be used as the working directory on the job server (it is required by the tool)
* `-mem 2g` means that 2Gb memory will be allocated for the tool (1g is not enough and the job will be terminated based on tests)
* `-once` means that if there is an already running instance of the job, no new job will be created
* `-N wikiStatPortal-dataCacher` is the name of the job

The id of the currently running job can be queried using:
```
job wikiStatPortal-dataCacher
```
The status of the currently running job can be queried using the ID returned by either the jsub or the job command using qstat:
```
qstat -j 3016746
```

The job is scheduled using crontab to run every 30 minutes:
```
30 * * * * cd ./tools && /usr/bin/jsub -cwd -mem 2g -once -N wikiStatPortal-dataCacher-cron node ./tools-out/tools/dataCacher/dataCacher
```
