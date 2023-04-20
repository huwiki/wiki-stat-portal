WikiStatPortal runs on the WikiMedia ToolForge.

# Project account

To manage jobs and web services, you must use the job account:
```
become [project id]
```

For example:
```
become wiki-stat-portal
```

# Webservice
Upload production build to `~/www/js` (of the project account).

It requires a `service.template` file with the following configuration:
```yaml
backend: kubernetes
cpu: 1
mem: 2Gi
type: node16
```

To run the webservice, run: `webservice --backend=kubernetes node16 start`

To stop the webservice, run: `webservice --backend=kubernetes node16 stop`

For a webservice shell you can use: `webservice --backend=kubernetes node16 shell`.
Use this to install dependencies using `npm install` (yarn is not available). For the normal project account, node.js 16 is not available.

# Setting up continuous job
The main command which runs caching of the edit statistics must be run periodically. The job will be scheduled on a job server using the `toolforge-jobs` command:

```
toolforge-jobs run wikistatportal-datacacher-kube --command ./runWikiEditCacher.sh --image tf-node16 --mem 4Gi
```
where
* The name after run defines the name of the job. This can be used to identify the job.
* `-mem 4Gi` means that 4Gb memory will be allocated for the tool (the default 1g is not enough and the job will be terminated based on tests)
* `-image tf-node16` means that if NodeJs 16 will be available in the execution environment

You need to make sure the working directory is correct (it is required by the tool). The most obvious solution is a bash script which navigates to the correct directory (`~/tools`).

Status of the jobs can be queryied using the following command:
```
toolforge-jobs list
```

The job is scheduled using crontab to run every hour at '53:
```
toolforge-jobs run wikistatportal-datacacher-kcron --command ./runWikiEditCacher.sh --image tf-node16 --mem 4Gi --schedule "53 * * * *"
```

To delete this job, use:
```
toolforge-jobs delete wikistatportal-datacacher-kcron
```