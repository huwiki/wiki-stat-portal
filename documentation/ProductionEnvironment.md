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
type: node12
```

To run the webservice, run: `webservice --backend=kubernetes node12 start`

To stop the webservice, run: `webservice --backend=kubernetes node12 stop`

For a webservice shell you can use: `webservice --backend=kubernetes node12 shell`.
Use this to install dependencies using `npm install` (yarn is not available). For the normal project account, node.js 10 is not available.

# Setting up continuous job
The main command which runs caching of the edit statistics must be run periodically. The job will be scheduled on a job server using the `toolforge-jobs` command:

```
toolforge-jobs run wikistatportal-datacacher-kube --command ./runWikiEditCacher.sh --image tf-node10-DEPRECATED --mem 2Gi
```
where
* The name after run defines the name of the job. This can be used to identify the job.
* `-mem 2Gi` means that 2Gb memory will be allocated for the tool (1g is not enough and the job will be terminated based on tests)
* `-image tf-node10-DEPRECATED` means that if NodeJs 10 will be available in the execution environment

You need to make sure the working directory is correct (it is required by the tool). The most obvious solution is a bash script which  navigates to the correct directory (`~/tools`).

Status of the jobs can be queryied using the following command:
```
toolforge-jobs list
```

The job is scheduled using crontab to run every hour at '53:
```
toolforge-jobs run wikistatportal-datacacher-kcron --command ./runWikiEditCacher.sh --image tf-node10-DEPRECATED --mem 2Gi --schedule "53 * * * *"
```
